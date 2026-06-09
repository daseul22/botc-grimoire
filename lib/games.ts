import { getDb } from "./db";
import { keepMarkerOnAdvance, parseMarker } from "./markers";
import type { Game, GamePlayer, NightActionRecord } from "./types";

// 서버 전용. 게임 상태는 가변 데이터 → seed가 건드리지 않는 별도 테이블.
//
// 스냅샷 모델: 플레이어 정체성/배치(game_players)는 전역(페이즈 무관),
// 상태(생존/마커)는 페이즈별 독립 스냅샷(game_phases)으로 저장한다.
// games.current_idx 가 현재 보고 있는 스냅샷을 가리킨다. 과거 페이즈로 돌아가
// 수정해도 다른 페이즈에 영향을 주지 않는다(cascade 없음).
const db = getDb();
db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'playing',
  phase TEXT,
  day INTEGER NOT NULL DEFAULT 1,
  result TEXT,
  config TEXT,
  current_idx INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_players (
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  character_id TEXT NOT NULL,
  alignment TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0.5,
  y REAL NOT NULL DEFAULT 0.5,
  locked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'alive',
  markers TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (game_id, seat)
);
CREATE TABLE IF NOT EXISTS game_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  phase TEXT,
  day INTEGER,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_phases (
  game_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  day INTEGER NOT NULL,
  phase TEXT NOT NULL,
  state TEXT NOT NULL,
  PRIMARY KEY (game_id, idx)
);
CREATE TABLE IF NOT EXISTS game_phase_actions (
  game_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  actions TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (game_id, idx)
);
`);
// 구버전 db 컬럼 보강 (idempotent)
for (const sql of [
  "ALTER TABLE games ADD COLUMN config TEXT",
  "ALTER TABLE games ADD COLUMN current_idx INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE game_players ADD COLUMN memo TEXT NOT NULL DEFAULT ''",
]) {
  try {
    db.exec(sql);
  } catch {
    /* 이미 존재 */
  }
}

const now = () => new Date().toISOString();

type SeatState = { status: string; markers: string[] };
type StateMap = Record<number, SeatState>;

function stateFromList(
  players: { seat: number; status?: string; markers?: string[] }[],
): StateMap {
  const s: StateMap = {};
  for (const p of players)
    s[p.seat] = { status: p.status ?? "alive", markers: p.markers ?? [] };
  return s;
}

// 구버전 게임(game_log 기반)을 스냅샷 모델로 1회 이관
(function migrate() {
  const games = db.prepare("SELECT id, phase, day FROM games").all() as {
    id: string;
    phase: string | null;
    day: number;
  }[];
  const hasPhase = db.prepare("SELECT 1 FROM game_phases WHERE game_id = ? LIMIT 1");
  const insPhase = db.prepare(
    "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,?,?,?,?)",
  );
  for (const g of games) {
    if (hasPhase.get(g.id)) continue;
    const logs = db
      .prepare("SELECT phase,day,data FROM game_log WHERE game_id = ? ORDER BY seq")
      .all(g.id) as { phase: string | null; day: number; data: string }[];
    const cur = db
      .prepare("SELECT seat,status,markers FROM game_players WHERE game_id = ?")
      .all(g.id) as { seat: number; status: string; markers: string }[];
    db.transaction(() => {
      let idx = 0;
      for (const lg of logs) {
        const players = (JSON.parse(lg.data).players ?? []) as SeatState[] &
          { seat: number }[];
        insPhase.run(g.id, idx++, lg.day ?? 1, lg.phase ?? "night", JSON.stringify(stateFromList(players)));
      }
      const curState: StateMap = {};
      for (const p of cur)
        curState[p.seat] = { status: p.status, markers: JSON.parse(p.markers) };
      insPhase.run(g.id, idx, g.day ?? 1, g.phase ?? "night", JSON.stringify(curState));
      db.prepare("UPDATE games SET current_idx = ? WHERE id = ?").run(idx, g.id);
    })();
  }
})();

type GameRow = {
  id: string;
  sheet_id: string;
  sheet_name: string;
  status: string;
  result: string | null;
  config: string | null;
  current_idx: number;
};
type PlayerRow = {
  seat: number;
  nickname: string;
  character_id: string;
  alignment: string;
  x: number;
  y: number;
  locked: number;
  memo: string;
};

export type GameConfig = { excludedIds: string[]; counts: Record<string, number> };
export type NewPlayer = Omit<GamePlayer, "locked" | "status" | "markers" | "memo">;
export type RoleAssignment = { seat: number; characterId: string; alignment: string };

function phaseCount(gameId: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS c FROM game_phases WHERE game_id = ?").get(gameId) as {
      c: number;
    }
  ).c;
}
function currentIdx(gameId: string): number {
  return (
    (db.prepare("SELECT current_idx FROM games WHERE id = ?").get(gameId) as
      | { current_idx: number }
      | undefined)?.current_idx ?? 0
  );
}
function readState(gameId: string, idx: number): StateMap {
  const row = db
    .prepare("SELECT state FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { state: string } | undefined;
  return row ? (JSON.parse(row.state) as StateMap) : {};
}
function writeState(gameId: string, idx: number, state: StateMap): void {
  db.prepare("UPDATE game_phases SET state = ? WHERE game_id = ? AND idx = ?").run(
    JSON.stringify(state),
    gameId,
    idx,
  );
}

function readActions(gameId: string, idx: number): NightActionRecord[] {
  const row = db
    .prepare("SELECT actions FROM game_phase_actions WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { actions: string } | undefined;
  return row ? (JSON.parse(row.actions) as NightActionRecord[]) : [];
}
function writeActions(gameId: string, idx: number, list: NightActionRecord[]): void {
  db.prepare(
    "INSERT INTO game_phase_actions (game_id,idx,actions) VALUES (?,?,?) ON CONFLICT(game_id,idx) DO UPDATE SET actions = excluded.actions",
  ).run(gameId, idx, JSON.stringify(list));
}

/** 현재 페이즈 스냅샷에 행동 기록 (actor 좌석 기준 upsert) */
export function recordAction(gameId: string, rec: NightActionRecord): void {
  const idx = currentIdx(gameId);
  const list = readActions(gameId, idx).filter((a) => a.actorSeat !== rec.actorSeat);
  list.push(rec);
  writeActions(gameId, idx, list);
}

/** 현재 페이즈 스냅샷에서 한 actor의 행동 기록 삭제 */
export function clearAction(gameId: string, actorSeat: number): void {
  const idx = currentIdx(gameId);
  writeActions(
    gameId,
    idx,
    readActions(gameId, idx).filter((a) => a.actorSeat !== actorSeat),
  );
}

function readPlayers(gameId: string, idx: number): GamePlayer[] {
  const state = readState(gameId, idx);
  return (
    db
      .prepare(
        "SELECT seat,nickname,character_id,alignment,x,y,locked,memo FROM game_players WHERE game_id = ? ORDER BY seat",
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
    status: g.status,
    phase: ph?.phase ?? "night",
    day: ph?.day ?? 1,
    result: g.result,
    phaseIndex: idx,
    phaseCount: phaseCount(id),
    players: readPlayers(id, idx),
    actions: readActions(id, idx),
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
    db.prepare(
      "UPDATE games SET current_idx = 0, status = 'playing', result = NULL, updated_at = ? WHERE id = ?",
    ).run(now(), gameId);
  })();
}

export function savePositions(
  gameId: string,
  positions: { seat: number; x: number; y: number }[],
): void {
  const upd = db.prepare(
    "UPDATE game_players SET x = ?, y = ? WHERE game_id = ? AND seat = ?",
  );
  db.transaction(() => {
    for (const p of positions) upd.run(p.x, p.y, gameId, p.seat);
    db.prepare("UPDATE games SET updated_at = ? WHERE id = ?").run(now(), gameId);
  })();
}

export function setLock(gameId: string, seat: number, locked: boolean): void {
  db.prepare("UPDATE game_players SET locked = ? WHERE game_id = ? AND seat = ?").run(
    locked ? 1 : 0,
    gameId,
    seat,
  );
}

/** 직업/진영 부분 변경 (1일차 밤 수동 조정 · 교체). 좌석/위치/상태는 유지. */
export function setRoles(
  gameId: string,
  updates: { seat: number; characterId: string; alignment: string }[],
): void {
  const upd = db.prepare(
    "UPDATE game_players SET character_id = ?, alignment = ? WHERE game_id = ? AND seat = ?",
  );
  db.transaction(() => {
    for (const u of updates) upd.run(u.characterId, u.alignment, gameId, u.seat);
  })();
}

/** 플레이어 메모 (전역, 스냅샷 무관) */
export function setMemo(gameId: string, seat: number, memo: string): void {
  db.prepare("UPDATE game_players SET memo = ? WHERE game_id = ? AND seat = ?").run(
    memo,
    gameId,
    seat,
  );
}

/** 현재 페이즈 스냅샷의 한 좌석 상태 변경 */
export function setStatus(gameId: string, seat: number, status: string): void {
  const idx = currentIdx(gameId);
  const s = readState(gameId, idx);
  s[seat] = { status, markers: s[seat]?.markers ?? [] };
  writeState(gameId, idx, s);
}

/** 현재 페이즈 스냅샷의 한 좌석 마커 토글 */
export function toggleMarker(gameId: string, seat: number, markerId: string): void {
  const idx = currentIdx(gameId);
  const s = readState(gameId, idx);
  const cur = s[seat]?.markers ?? [];
  const base = parseMarker(markerId).base;
  // 같은 마커면 해제, 아니면 동일 base 제거 후 추가(집착 대상 교체 등)
  const markers = cur.includes(markerId)
    ? cur.filter((m) => m !== markerId)
    : [...cur.filter((m) => parseMarker(m).base !== base), markerId];
  s[seat] = { status: s[seat]?.status ?? "alive", markers };
  writeState(gameId, idx, s);
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
  for (const seat of Object.keys(state)) {
    const k = Number(seat);
    next[k] = {
      status: state[k].status,
      markers: state[k].markers.filter((m) => keepMarkerOnAdvance(m, leavingDay)),
    };
  }
  db.transaction(() => {
    db.prepare(
      "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,?,?,?,?)",
    ).run(gameId, idx + 1, nextDay, nextPhase, JSON.stringify(next));
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
};
export type HistoryEntry = {
  idx: number;
  phase: string;
  day: number;
  players: HistoryPlayer[];
  actions: NightActionRecord[];
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
      players: ids.map((p) => ({
        seat: p.seat,
        nickname: p.nickname,
        characterId: p.character_id,
        alignment: p.alignment,
        status: state[p.seat]?.status ?? "alive",
        markers: state[p.seat]?.markers ?? [],
      })),
    };
  });
}

export type GameSummary = {
  id: string;
  sheetName: string;
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
      `SELECT g.id, g.sheet_name AS sheetName, g.status, g.result, g.current_idx AS currentIdx,
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
      status: r.status,
      day: p?.day ?? 1,
      phase: p?.phase ?? null,
      result: r.result,
      playerCount: r.playerCount,
      createdAt: r.createdAt,
    };
  });
}

export function deleteGame(id: string): void {
  db.transaction(() => {
    db.prepare("DELETE FROM game_players WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_log WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_phases WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_phase_actions WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM games WHERE id = ?").run(id);
  })();
}
