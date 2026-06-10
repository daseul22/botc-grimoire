import { getDb } from "../db";

// 서버 전용. 게임 상태는 가변 데이터 → seed가 건드리지 않는 별도 테이블.
//
// 스냅샷 모델: 플레이어 정체성/배치(game_players)는 전역(페이즈 무관),
// 상태(생존/마커)는 페이즈별 독립 스냅샷(game_phases)으로 저장한다.
// games.current_idx 가 현재 보고 있는 스냅샷을 가리킨다. 과거 페이즈로 돌아가
// 수정해도 다른 페이즈에 영향을 주지 않는다(cascade 없음).
export const db = getDb();
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
  "ALTER TABLE games ADD COLUMN bluffs TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE game_players ADD COLUMN ghost_vote_used INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE game_phases ADD COLUMN votes TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE game_phases ADD COLUMN note TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE game_phases ADD COLUMN done TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN claimed TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN global_markers TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN lunatic_bluffs TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN lunatic_minions TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN disguises TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE game_phases ADD COLUMN timers TEXT NOT NULL DEFAULT '{}'",
]) {
  try {
    db.exec(sql);
  } catch {
    /* 이미 존재 */
  }
}

export const now = () => new Date().toISOString();

export type SeatState = { status: string; markers: string[]; cause?: string };
export type StateMap = Record<number, SeatState>;

export function stateFromList(
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

export type GameRow = {
  id: string;
  sheet_id: string;
  sheet_name: string;
  status: string;
  result: string | null;
  config: string | null;
  current_idx: number;
  bluffs: string | null;
};
export type PlayerRow = {
  seat: number;
  nickname: string;
  character_id: string;
  alignment: string;
  x: number;
  y: number;
  locked: number;
  memo: string;
  ghost_vote_used: number;
};

export function phaseCount(gameId: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS c FROM game_phases WHERE game_id = ?").get(gameId) as {
      c: number;
    }
  ).c;
}
export function currentIdx(gameId: string): number {
  return (
    (db.prepare("SELECT current_idx FROM games WHERE id = ?").get(gameId) as
      | { current_idx: number }
      | undefined)?.current_idx ?? 0
  );
}
export function readState(gameId: string, idx: number): StateMap {
  const row = db
    .prepare("SELECT state FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { state: string } | undefined;
  return row ? (JSON.parse(row.state) as StateMap) : {};
}
export function writeState(gameId: string, idx: number, state: StateMap): void {
  db.prepare("UPDATE game_phases SET state = ? WHERE game_id = ? AND idx = ?").run(
    JSON.stringify(state),
    gameId,
    idx,
  );
}
