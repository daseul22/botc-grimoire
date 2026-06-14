// 게임 라이프사이클: 생성/조회/재추첨/페이즈 전환/종료/복기/목록/삭제.
import { keepMarkerOnAdvance, parseMarker } from "../markers";
import type {
  Game,
  GamePlayer,
  NightActionRecord,
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
    .get(id, idx) as { day: number; phase: string } | undefined;
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
}): string {
  const id = "g-" + crypto.randomUUID().slice(0, 8);
  const t = now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO games (id,sheet_id,sheet_name,status,phase,day,result,config,current_idx,created_at,updated_at)
       VALUES (?,?,?,'playing','night',1,NULL,?,0,?,?)`,
    ).run(id, input.sheetId, input.sheetName, JSON.stringify(input.config), t, t);
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
  const state = JSON.parse(cur.state) as StateMap;
  const next: StateMap = {};
  // 자동 변절(메제펠리스 단어 발화): 낮→밤 전환 시 turning 마커가 있는 좌석은 alignment=evil로 변경.
  const turningSeats: number[] = [];
  for (const seat of Object.keys(state)) {
    const k = Number(seat);
    const seatMarkers = state[k].markers;
    if (leavingDay && seatMarkers.some((m) => parseMarker(m).base === "turning")) {
      turningSeats.push(k);
    }
    next[k] = {
      status: state[k].status,
      // 사망 사유(처형/밤 등)도 다음 페이즈로 이어진다 — 빠뜨리면 다음 날·밤에 사망 글리프가 초기화됨.
      cause: state[k].status === "dead" ? state[k].cause ?? "" : "",
      markers: seatMarkers.filter((m) => keepMarkerOnAdvance(m, leavingDay)),
    };
  }
  // 식인종(cannibal): 낮 종료 시, 이 낮에 *처형*된 플레이어의 능력을 다음 밤부터 얻는다.
  //   처형 대상이 악이면 취함(영구)도 적용(거짓 정보), 선이면 취함 해제. 처형이 있을 때마다 갱신.
  //   처형이 없는 날은 직전 능력/취함을 그대로 유지(permanent 마커가 복사됨).
  if (leavingDay) {
    const players = db
      .prepare("SELECT seat, character_id, alignment FROM game_players WHERE game_id = ?")
      .all(gameId) as { seat: number; character_id: string; alignment: string }[];
    const cannibal = players.find((p) => p.character_id === "cannibal");
    const execVote = readVotes(gameId, idx).find((v) => v.executed);
    const executed = execVote
      ? players.find((p) => p.seat === execVote.nominee)
      : undefined;
    if (
      cannibal &&
      executed &&
      executed.seat !== cannibal.seat &&
      next[cannibal.seat] &&
      next[cannibal.seat].status !== "dead"
    ) {
      const st = next[cannibal.seat];
      // 직전 처형으로 얻은 능력획득/능력없음/취함을 모두 걷어내고 이번 처형 기준으로 재적용.
      // (예: 철학자를 먹어 gained:philosopher + 철학자 능력으로 또 얻어 gained:X,
      //  둘 다 일회성이라 noability:philosopher/noability:X까지 쌓인 경우 → 싹 비우고 새 능력만.)
      st.markers = st.markers.filter((m) => {
        const b = parseMarker(m).base;
        return b !== "gained" && b !== "noability" && m !== "drunk";
      });
      st.markers.push(`gained:${executed.character_id}`);
      if (executed.alignment === "evil") st.markers.push("drunk");
    }
  }
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
};

export function listGames(): GameSummary[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.sheet_name AS sheetName, g.label, g.status, g.result, g.current_idx AS currentIdx,
              g.created_at AS createdAt,
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
