// 게임 라이프사이클: 생성/조회/재추첨/페이즈 전환/종료/복기/목록/삭제.
import { keepMarkerOnAdvance, parseMarker } from "../markers";
import type {
  Game,
  GamePlayer,
  NightActionRecord,
  Phase,
  PhaseTimers,
  VoteRecord,
} from "../types";
import {
  currentIdx,
  db,
  now,
  phaseCount,
  readState,
  type GameRow,
  type PlayerRow,
  type StateMap,
} from "./schema";
import { readActions, readDone, readNote, readTimers, readVotes } from "./phase-data";
import {
  getClaims,
  getDisguises,
  getGlobalMarkers,
  getLunaticBluffs,
  getLunaticMinions,
} from "./meta";
import { undoInfo } from "./undo";

export type GameConfig = { excludedIds: string[]; counts: Record<string, number> };
export type NewPlayer = Omit<
  GamePlayer,
  "locked" | "status" | "markers" | "memo" | "deathCause" | "ghostVoteUsed"
>;
export type RoleAssignment = { seat: number; characterId: string; alignment: string };

function readPlayers(gameId: string, idx: number): GamePlayer[] {
  const state = readState(gameId, idx);
  return (
    db
      .prepare(
        "SELECT seat,nickname,character_id,alignment,x,y,locked,memo,ghost_vote_used FROM game_players WHERE game_id = ? ORDER BY seat",
      )
      .all(gameId) as PlayerRow[]
  ).map((r) => ({
    seat: r.seat,
    nickname: r.nickname,
    characterId: r.character_id,
    alignment: r.alignment as GamePlayer["alignment"],
    x: r.x,
    y: r.y,
    locked: !!r.locked,
    status: state[r.seat]?.status ?? "alive",
    markers: state[r.seat]?.markers ?? [],
    memo: r.memo ?? "",
    deathCause: state[r.seat]?.cause ?? "",
    ghostVoteUsed: !!r.ghost_vote_used,
  }));
}

export function getGame(id: string): Game | undefined {
  const g = db.prepare("SELECT * FROM games WHERE id = ?").get(id) as
    | GameRow
    | undefined;
  if (!g) return undefined;
  const idx = g.current_idx ?? 0;
  const ph = db
    .prepare("SELECT day,phase FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(id, idx) as { day: number; phase: Phase } | undefined;
  return {
    id: g.id,
    sheetId: g.sheet_id,
    sheetName: g.sheet_name,
    label: g.label ?? "",
    status: g.status,
    phase: ph?.phase ?? "night",
    day: ph?.day ?? 1,
    result: g.result,
    phaseIndex: idx,
    phaseCount: phaseCount(id),
    players: readPlayers(id, idx),
    actions: readActions(id, idx),
    votes: readVotes(id, idx),
    bluffs: g.bluffs ? (JSON.parse(g.bluffs) as string[]) : [],
    doneSeats: readDone(id, idx),
    note: readNote(id, idx),
    globalMarkers: getGlobalMarkers(id),
    lunaticBluffs: getLunaticBluffs(id),
    lunaticMinions: getLunaticMinions(id),
    disguises: getDisguises(id),
    phaseTimers: readTimers(id, idx),
    undo: undoInfo(id),
    claimedSeats: Object.keys(getClaims(id)).map(Number),
  };
}

/** 게임 소유자(시작한 이야기꾼) user id. 없으면 null(레거시). 권한 판정용. */
export function getGameOwner(id: string): number | null {
  const r = db.prepare("SELECT owner_id FROM games WHERE id = ?").get(id) as
    | { owner_id: number | null }
    | undefined;
  return r ? r.owner_id : null;
}

export function getGameConfig(
  id: string,
): (GameConfig & { sheetId: string }) | undefined {
  const g = db.prepare("SELECT sheet_id, config FROM games WHERE id = ?").get(id) as
    | { sheet_id: string; config: string | null }
    | undefined;
  if (!g) return undefined;
  const cfg = (g.config ? JSON.parse(g.config) : { excludedIds: [], counts: {} }) as GameConfig;
  return { sheetId: g.sheet_id, excludedIds: cfg.excludedIds ?? [], counts: cfg.counts ?? {} };
}

export function createGame(input: {
  sheetId: string;
  sheetName: string;
  config: GameConfig;
  players: NewPlayer[];
  ownerId?: number | null;
}): string {
  const id = "g-" + crypto.randomUUID().slice(0, 8);
  const t = now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO games (id,sheet_id,sheet_name,status,phase,day,result,config,current_idx,created_at,updated_at,owner_id)
       VALUES (?,?,?,'playing','night',1,NULL,?,0,?,?,?)`,
    ).run(id, input.sheetId, input.sheetName, JSON.stringify(input.config), t, t, input.ownerId ?? null);
    const insPlayer = db.prepare(
      `INSERT INTO game_players (game_id,seat,nickname,character_id,alignment,x,y)
       VALUES (?,?,?,?,?,?,?)`,
    );
    const state: StateMap = {};
    for (const p of input.players) {
      insPlayer.run(id, p.seat, p.nickname, p.characterId, p.alignment, p.x, p.y);
      state[p.seat] = { status: "alive", markers: [] };
    }
    db.prepare(
      "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,0,1,'night',?)",
    ).run(id, JSON.stringify(state));
  })();
  return id;
}

/**
 * 게임 복제 — 같은 사람들로 다음 판을 빠르게 시작하기 위함.
 * 정체성(좌석·닉네임·직업·진영·배치·고정)과 셋업(시트·구성·블러핑·위장·미치광이)은 그대로 가져오되,
 * 진행 상태(행동·투표·마커·사망·메모·유령표·되돌리기·직업배포 점유)는 모두 비운
 * "1일차 밤 셋업" 상태의 새 게임을 만든다. 직업은 그대로 유지 — 새 직업이 필요하면 새 게임에서 재추첨.
 * 새 게임 id 반환.
 */
export function cloneGame(srcId: string, ownerId?: number | null): string {
  const src = db
    .prepare(
      "SELECT sheet_id, sheet_name, config, bluffs, lunatic_bluffs, lunatic_minions, disguises, label FROM games WHERE id = ?",
    )
    .get(srcId) as
    | {
        sheet_id: string;
        sheet_name: string;
        config: string | null;
        bluffs: string | null;
        lunatic_bluffs: string | null;
        lunatic_minions: string | null;
        disguises: string | null;
        label: string | null;
      }
    | undefined;
  if (!src) throw new Error("원본 게임을 찾을 수 없습니다.");
  const players = db
    .prepare(
      "SELECT seat,nickname,character_id,alignment,x,y,locked FROM game_players WHERE game_id = ? ORDER BY seat",
    )
    .all(srcId) as {
    seat: number;
    nickname: string;
    character_id: string;
    alignment: string;
    x: number;
    y: number;
    locked: number;
  }[];

  const id = "g-" + crypto.randomUUID().slice(0, 8);
  const t = now();
  const baseName = src.label && src.label.trim() ? src.label.trim() : src.sheet_name;
  const label = `${baseName} (사본)`;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO games (id,sheet_id,sheet_name,status,phase,day,result,config,current_idx,created_at,updated_at,bluffs,claimed,global_markers,lunatic_bluffs,lunatic_minions,disguises,label,owner_id)
       VALUES (?,?,?,'playing','night',1,NULL,?,0,?,?,?,'[]','[]',?,?,?,?,?)`,
    ).run(
      id,
      src.sheet_id,
      src.sheet_name,
      src.config ?? null,
      t,
      t,
      src.bluffs ?? "[]",
      src.lunatic_bluffs ?? "[]",
      src.lunatic_minions ?? "[]",
      src.disguises ?? "{}",
      label,
      ownerId ?? null,
    );
    const ins = db.prepare(
      `INSERT INTO game_players (game_id,seat,nickname,character_id,alignment,x,y,locked,status,markers,memo,ghost_vote_used)
       VALUES (?,?,?,?,?,?,?,?,'alive','[]','',0)`,
    );
    const state: StateMap = {};
    for (const p of players) {
      ins.run(id, p.seat, p.nickname, p.character_id, p.alignment, p.x, p.y, p.locked);
      state[p.seat] = { status: "alive", markers: [] };
    }
    db.prepare(
      "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,0,1,'night',?)",
    ).run(id, JSON.stringify(state));
  })();
  return id;
}

/** 재추첨: 좌석/닉네임/위치는 유지하고 직업·진영만 교체 + 진행상태 전체 초기화 */
export function redrawRoles(gameId: string, roles: RoleAssignment[]): void {
  db.transaction(() => {
    const upd = db.prepare(
      "UPDATE game_players SET character_id = ?, alignment = ? WHERE game_id = ? AND seat = ?",
    );
    for (const r of roles) upd.run(r.characterId, r.alignment, gameId, r.seat);
    db.prepare("DELETE FROM game_phases WHERE game_id = ?").run(gameId);
    db.prepare("DELETE FROM game_phase_actions WHERE game_id = ?").run(gameId);
    const seats = db
      .prepare("SELECT seat FROM game_players WHERE game_id = ?")
      .all(gameId) as { seat: number }[];
    const state: StateMap = {};
    for (const s of seats) state[s.seat] = { status: "alive", markers: [] };
    db.prepare(
      "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,0,1,'night',?)",
    ).run(gameId, JSON.stringify(state));
    db.prepare("UPDATE game_players SET ghost_vote_used = 0 WHERE game_id = ?").run(gameId);
    db.prepare(
      "UPDATE games SET current_idx = 0, status = 'playing', result = NULL, bluffs = '[]', claimed = '[]', global_markers = '[]', lunatic_bluffs = '[]', lunatic_minions = '[]', disguises = '{}', updated_at = ? WHERE id = ?",
    ).run(now(), gameId);
  })();
}

/**
 * 다음 스냅샷의 좌석 상태 계산(순수): 일시 마커 만료 + dying 자동 사망(밤→낮) + 사망원인 이월.
 * turningSeats(낮→밤 자동 변절 대상)도 함께 돌려준다.
 */
function computeNextState(
  state: StateMap,
  leavingDay: boolean,
): { next: StateMap; turningSeats: number[] } {
  const next: StateMap = {};
  const turningSeats: number[] = [];
  for (const seat of Object.keys(state)) {
    const k = Number(seat);
    const seatMarkers = state[k].markers;
    // 자동 변절(메제펠리스 단어 발화): 낮→밤 전환 시 turning 마커가 있는 좌석은 alignment=evil로.
    if (leavingDay && seatMarkers.some((m) => parseMarker(m).base === "turning")) {
      turningSeats.push(k);
    }
    // 사망예정(dying): 밤→낮 전환 시 자동 사망(원인=밤 살해). ST가 보호 판단까지 끝내고 단 마커이므로
    // 여기서 죽인다(보호되면 애초에 안 단다). 낮에 다는 dying(슬레이어·처녀)은 ST가 직접 처리.
    const wasAlive = state[k].status !== "dead";
    const willDie =
      !leavingDay && wasAlive && seatMarkers.some((m) => parseMarker(m).base === "dying");
    next[k] = {
      status: willDie ? "dead" : state[k].status,
      // 사망 사유(처형/밤 등)도 다음 페이즈로 이어진다 — 빠뜨리면 사망 글리프가 초기화됨.
      cause: willDie ? "night" : state[k].status === "dead" ? state[k].cause ?? "" : "",
      markers: seatMarkers.filter((m) => keepMarkerOnAdvance(m, leavingDay)),
    };
  }
  return { next, turningSeats };
}

/**
 * 식인종(cannibal): 낮 종료 시 그 낮 *처형* 대상의 능력을 다음 밤부터 얻는다(next를 in-place 갱신).
 *   처형 대상이 악이면 취함(영구) 적용(거짓 정보), 선이면 취함 해제. 처형이 있을 때마다 재적용.
 *   처형이 없으면 직전 능력/취함을 그대로 유지(permanent 마커가 복사됨).
 */
function applyCannibalOnExecution(gameId: string, idx: number, next: StateMap): void {
  const players = db
    .prepare("SELECT seat, character_id, alignment FROM game_players WHERE game_id = ?")
    .all(gameId) as { seat: number; character_id: string; alignment: string }[];
  const cannibal = players.find((p) => p.character_id === "cannibal");
  const execVote = readVotes(gameId, idx).find((v) => v.executed);
  const executed = execVote ? players.find((p) => p.seat === execVote.nominee) : undefined;
  if (
    !cannibal ||
    !executed ||
    executed.seat === cannibal.seat ||
    !next[cannibal.seat] ||
    next[cannibal.seat].status === "dead"
  )
    return;
  const st = next[cannibal.seat];
  // 직전 처형으로 얻은 능력획득/능력없음/취함을 모두 걷어내고 이번 처형 기준으로 재적용.
  // (예: 철학자를 먹어 gained:philosopher + 그 능력으로 또 얻어 gained:X, noability까지 쌓인 경우 → 싹 비우고 새 능력만.)
  st.markers = st.markers.filter((m) => {
    const b = parseMarker(m).base;
    return b !== "gained" && b !== "noability" && m !== "drunk";
  });
  st.markers.push(`gained:${executed.character_id}`);
  if (executed.alignment === "evil") st.markers.push("drunk");
}

/**
 * 다음 페이즈로. 이미 뒤에 스냅샷이 있으면(과거로 갔다가 진행) 포인터만 이동,
 * 최신이면 현재를 복사해 새 스냅샷 생성(일시 마커 제거 + 밤↔낮/일차 계산).
 */
export function advancePhase(gameId: string): void {
  const idx = currentIdx(gameId);
  const total = phaseCount(gameId);
  if (idx < total - 1) {
    db.prepare("UPDATE games SET current_idx = ?, updated_at = ? WHERE id = ?").run(
      idx + 1,
      now(),
      gameId,
    );
    return;
  }
  const cur = db
    .prepare("SELECT day,phase,state FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { day: number; phase: string; state: string };
  const leavingDay = cur.phase === "day"; // 낮 종료 = 황혼 통과
  const nextPhase = cur.phase === "night" ? "day" : "night";
  const nextDay = leavingDay ? cur.day + 1 : cur.day;
  const { next, turningSeats } = computeNextState(JSON.parse(cur.state) as StateMap, leavingDay);
  if (leavingDay) applyCannibalOnExecution(gameId, idx, next);
  db.transaction(() => {
    db.prepare(
      "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,?,?,?,?)",
    ).run(gameId, idx + 1, nextDay, nextPhase, JSON.stringify(next));
    if (turningSeats.length) {
      const upd = db.prepare(
        "UPDATE game_players SET alignment = 'evil' WHERE game_id = ? AND seat = ?",
      );
      for (const s of turningSeats) upd.run(gameId, s);
    }
    db.prepare("UPDATE games SET current_idx = ?, updated_at = ? WHERE id = ?").run(
      idx + 1,
      now(),
      gameId,
    );
  })();
}

/** 이전 페이즈로 (포인터만 이동, 각 스냅샷은 독립 유지) */
export function prevPhase(gameId: string): void {
  const idx = currentIdx(gameId);
  if (idx > 0)
    db.prepare("UPDATE games SET current_idx = ?, updated_at = ? WHERE id = ?").run(
      idx - 1,
      now(),
      gameId,
    );
}

export function finishGame(gameId: string, result: string): void {
  db.prepare(
    "UPDATE games SET status = 'finished', result = ?, updated_at = ? WHERE id = ?",
  ).run(result, now(), gameId);
}

export type HistoryPlayer = {
  seat: number;
  nickname: string;
  characterId: string;
  alignment: string;
  status: string;
  markers: string[];
  deathCause: string;
};
export type HistoryEntry = {
  idx: number;
  phase: string;
  day: number;
  players: HistoryPlayer[];
  actions: NightActionRecord[];
  votes: VoteRecord[];
  timers: PhaseTimers;
};

export function getHistory(gameId: string): HistoryEntry[] {
  const ids = db
    .prepare(
      "SELECT seat,nickname,character_id,alignment FROM game_players WHERE game_id = ? ORDER BY seat",
    )
    .all(gameId) as {
    seat: number;
    nickname: string;
    character_id: string;
    alignment: string;
  }[];
  const phases = db
    .prepare("SELECT idx,day,phase,state FROM game_phases WHERE game_id = ? ORDER BY idx")
    .all(gameId) as { idx: number; day: number; phase: string; state: string }[];
  return phases.map((ph) => {
    const state = JSON.parse(ph.state) as StateMap;
    return {
      idx: ph.idx,
      day: ph.day,
      phase: ph.phase,
      actions: readActions(gameId, ph.idx),
      votes: readVotes(gameId, ph.idx),
      timers: readTimers(gameId, ph.idx),
      players: ids.map((p) => ({
        seat: p.seat,
        nickname: p.nickname,
        characterId: p.character_id,
        alignment: p.alignment,
        status: state[p.seat]?.status ?? "alive",
        markers: state[p.seat]?.markers ?? [],
        deathCause: state[p.seat]?.cause ?? "",
      })),
    };
  });
}

export type GameSummary = {
  id: string;
  sheetName: string;
  label: string;
  status: string;
  day: number;
  phase: string | null;
  result: string | null;
  playerCount: number;
  createdAt: string;
  /** 게임을 시작한 이야기꾼 user id (레거시는 null). */
  ownerId: number | null;
};

export function listGames(): GameSummary[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.sheet_name AS sheetName, g.label, g.status, g.result, g.current_idx AS currentIdx,
              g.created_at AS createdAt, g.owner_id AS ownerId,
              (SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id) AS playerCount
       FROM games g ORDER BY g.created_at DESC`,
    )
    .all() as (Omit<GameSummary, "day" | "phase"> & { currentIdx: number })[];
  const ph = db.prepare(
    "SELECT day,phase FROM game_phases WHERE game_id = ? AND idx = ?",
  );
  return rows.map((r) => {
    const p = ph.get(r.id, r.currentIdx) as { day: number; phase: string } | undefined;
    return {
      id: r.id,
      sheetName: r.sheetName,
      label: r.label ?? "",
      status: r.status,
      day: p?.day ?? 1,
      phase: p?.phase ?? null,
      result: r.result,
      playerCount: r.playerCount,
      createdAt: r.createdAt,
      ownerId: r.ownerId ?? null,
    };
  });
}

/** 게임 표시 이름(구분용) 지정. 빈 문자열이면 목록에서 sheetName으로 폴백. */
export function renameGame(id: string, label: string): void {
  db.prepare("UPDATE games SET label = ?, updated_at = ? WHERE id = ?").run(
    label.trim(),
    now(),
    id,
  );
}

export function deleteGame(id: string): void {
  db.transaction(() => {
    db.prepare("DELETE FROM game_players WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_log WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_phases WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_phase_actions WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_undo_stack WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM games WHERE id = ?").run(id);
  })();
}
