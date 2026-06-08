import { getDb } from "./db";
import { isTransient } from "./markers";
import type { Game, GamePlayer } from "./types";

// 서버 전용. 게임 상태는 가변 데이터 → seed가 건드리지 않는 별도 테이블.
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
`);
// 기존 db에 config 컬럼이 없으면 추가 (idempotent)
try {
  db.exec("ALTER TABLE games ADD COLUMN config TEXT");
} catch {
  /* 이미 존재 */
}

const now = () => new Date().toISOString();

type GameRow = {
  id: string;
  sheet_id: string;
  sheet_name: string;
  status: string;
  phase: string | null;
  day: number;
  result: string | null;
  config: string | null;
};
type PlayerRow = {
  seat: number;
  nickname: string;
  character_id: string;
  alignment: string;
  x: number;
  y: number;
  locked: number;
  status: string;
  markers: string;
};

export type GameConfig = { excludedIds: string[]; counts: Record<string, number> };
export type NewPlayer = Omit<GamePlayer, "locked" | "status" | "markers">;
export type RoleAssignment = { seat: number; characterId: string; alignment: string };

function readPlayers(gameId: string): GamePlayer[] {
  return (
    db
      .prepare("SELECT * FROM game_players WHERE game_id = ? ORDER BY seat")
      .all(gameId) as PlayerRow[]
  ).map((r) => ({
    seat: r.seat,
    nickname: r.nickname,
    characterId: r.character_id,
    alignment: r.alignment as GamePlayer["alignment"],
    x: r.x,
    y: r.y,
    locked: !!r.locked,
    status: r.status,
    markers: JSON.parse(r.markers) as string[],
  }));
}

export function getGame(id: string): Game | undefined {
  const g = db.prepare("SELECT * FROM games WHERE id = ?").get(id) as
    | GameRow
    | undefined;
  if (!g) return undefined;
  return {
    id: g.id,
    sheetId: g.sheet_id,
    sheetName: g.sheet_name,
    status: g.status,
    phase: g.phase,
    day: g.day,
    result: g.result,
    players: readPlayers(id),
  };
}

export function getGameConfig(id: string): (GameConfig & { sheetId: string }) | undefined {
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
  const insGame = db.prepare(
    `INSERT INTO games (id,sheet_id,sheet_name,status,phase,day,result,config,created_at,updated_at)
     VALUES (?,?,?,'playing','night',1,NULL,?,?,?)`,
  );
  const insPlayer = db.prepare(
    `INSERT INTO game_players (game_id,seat,nickname,character_id,alignment,x,y)
     VALUES (?,?,?,?,?,?,?)`,
  );
  db.transaction(() => {
    insGame.run(id, input.sheetId, input.sheetName, JSON.stringify(input.config), t, t);
    for (const p of input.players)
      insPlayer.run(id, p.seat, p.nickname, p.characterId, p.alignment, p.x, p.y);
  })();
  return id;
}

/** 재추첨: 좌석/닉네임/위치는 유지하고 직업·진영만 교체 + 진행상태 초기화 */
export function redrawRoles(gameId: string, roles: RoleAssignment[]): void {
  const upd = db.prepare(
    `UPDATE game_players SET character_id = ?, alignment = ?, status = 'alive', markers = '[]'
     WHERE game_id = ? AND seat = ?`,
  );
  db.transaction(() => {
    for (const r of roles) upd.run(r.characterId, r.alignment, gameId, r.seat);
    db.prepare(
      "UPDATE games SET phase = 'night', day = 1, status = 'playing', result = NULL, updated_at = ? WHERE id = ?",
    ).run(now(), gameId);
    db.prepare("DELETE FROM game_log WHERE game_id = ?").run(gameId);
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
  db.prepare(
    "UPDATE game_players SET locked = ? WHERE game_id = ? AND seat = ?",
  ).run(locked ? 1 : 0, gameId, seat);
}

export function setStatus(gameId: string, seat: number, status: string): void {
  db.prepare(
    "UPDATE game_players SET status = ? WHERE game_id = ? AND seat = ?",
  ).run(status, gameId, seat);
}

export function toggleMarker(gameId: string, seat: number, markerId: string): void {
  const row = db
    .prepare("SELECT markers FROM game_players WHERE game_id = ? AND seat = ?")
    .get(gameId, seat) as { markers: string } | undefined;
  if (!row) return;
  const set = new Set(JSON.parse(row.markers) as string[]);
  if (set.has(markerId)) set.delete(markerId);
  else set.add(markerId);
  db.prepare(
    "UPDATE game_players SET markers = ? WHERE game_id = ? AND seat = ?",
  ).run(JSON.stringify([...set]), gameId, seat);
}

function snapshot(gameId: string, phase: string | null, day: number): void {
  const players = readPlayers(gameId).map((p) => ({
    seat: p.seat,
    nickname: p.nickname,
    characterId: p.characterId,
    alignment: p.alignment,
    status: p.status,
    markers: p.markers,
  }));
  const seq =
    (
      db
        .prepare("SELECT COALESCE(MAX(seq),-1) AS m FROM game_log WHERE game_id = ?")
        .get(gameId) as { m: number }
    ).m + 1;
  db.prepare(
    "INSERT INTO game_log (game_id,seq,phase,day,data,created_at) VALUES (?,?,?,?,?,?)",
  ).run(gameId, seq, phase, day, JSON.stringify({ players }), now());
}

/** 다음 페이즈로: 현재 상태를 기록(복기) → 밤↔낮 전환 → 일시적 마커 자동 제거 */
export function advancePhase(gameId: string): void {
  const g = db.prepare("SELECT phase, day FROM games WHERE id = ?").get(gameId) as
    | { phase: string | null; day: number }
    | undefined;
  if (!g) return;
  db.transaction(() => {
    snapshot(gameId, g.phase, g.day);
    const nextPhase = g.phase === "night" ? "day" : "night";
    const nextDay = g.phase === "day" ? g.day + 1 : g.day;
    db.prepare(
      "UPDATE games SET phase = ?, day = ?, updated_at = ? WHERE id = ?",
    ).run(nextPhase, nextDay, now(), gameId);
    // 일시적 마커 제거
    for (const p of readPlayers(gameId)) {
      const kept = p.markers.filter((id) => !isTransient(id));
      if (kept.length !== p.markers.length)
        db.prepare(
          "UPDATE game_players SET markers = ? WHERE game_id = ? AND seat = ?",
        ).run(JSON.stringify(kept), gameId, p.seat);
    }
  })();
}

export function finishGame(gameId: string, result: string): void {
  const g = db.prepare("SELECT phase, day FROM games WHERE id = ?").get(gameId) as
    | { phase: string | null; day: number }
    | undefined;
  if (!g) return;
  db.transaction(() => {
    snapshot(gameId, g.phase, g.day);
    db.prepare(
      "UPDATE games SET status = 'finished', result = ?, updated_at = ? WHERE id = ?",
    ).run(result, now(), gameId);
  })();
}

export type HistoryEntry = {
  seq: number;
  phase: string | null;
  day: number;
  players: {
    seat: number;
    nickname: string;
    characterId: string;
    alignment: string;
    status: string;
    markers: string[];
  }[];
};

export function getHistory(gameId: string): HistoryEntry[] {
  return (
    db
      .prepare("SELECT seq, phase, day, data FROM game_log WHERE game_id = ? ORDER BY seq")
      .all(gameId) as { seq: number; phase: string | null; day: number; data: string }[]
  ).map((r) => ({
    seq: r.seq,
    phase: r.phase,
    day: r.day,
    players: JSON.parse(r.data).players,
  }));
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
  return db
    .prepare(
      `SELECT g.id, g.sheet_name AS sheetName, g.status, g.day, g.phase, g.result,
              g.created_at AS createdAt,
              (SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id) AS playerCount
       FROM games g ORDER BY g.created_at DESC`,
    )
    .all() as GameSummary[];
}

export function deleteGame(id: string): void {
  db.transaction(() => {
    db.prepare("DELETE FROM game_players WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_log WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM games WHERE id = ?").run(id);
  })();
}
