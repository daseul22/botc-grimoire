import { getDb } from "./db";
import type { Game, GamePlayer } from "./types";

// 서버 전용. 게임 상태는 가변 데이터 → seed가 건드리지 않는 별도 테이블.
// 향후(페이즈/사망/효과/복기) 대비해 컬럼을 미리 마련해 둔다.
getDb().exec(`
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'playing',
  phase TEXT,
  day INTEGER NOT NULL DEFAULT 1,
  result TEXT,
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
-- 페이즈별 히스토리/복기용 (향후 사용)
CREATE TABLE IF NOT EXISTS game_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  phase TEXT,
  day INTEGER,
  kind TEXT,
  data TEXT,
  created_at TEXT NOT NULL
);
`);

type GameRow = {
  id: string;
  sheet_id: string;
  sheet_name: string;
  status: string;
  phase: string | null;
  day: number;
  result: string | null;
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

export type NewPlayer = Omit<GamePlayer, "locked" | "status" | "markers">;

export function createGame(input: {
  sheetId: string;
  sheetName: string;
  players: NewPlayer[];
}): string {
  const db = getDb();
  const id = "g-" + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const insGame = db.prepare(
    `INSERT INTO games (id,sheet_id,sheet_name,status,phase,day,result,created_at,updated_at)
     VALUES (?,?,?,'playing',NULL,1,NULL,?,?)`,
  );
  const insPlayer = db.prepare(
    `INSERT INTO game_players (game_id,seat,nickname,character_id,alignment,x,y)
     VALUES (?,?,?,?,?,?,?)`,
  );
  const tx = db.transaction(() => {
    insGame.run(id, input.sheetId, input.sheetName, now, now);
    for (const p of input.players)
      insPlayer.run(id, p.seat, p.nickname, p.characterId, p.alignment, p.x, p.y);
  });
  tx();
  return id;
}

export function getGame(id: string): Game | undefined {
  const db = getDb();
  const g = db.prepare("SELECT * FROM games WHERE id = ?").get(id) as
    | GameRow
    | undefined;
  if (!g) return undefined;
  const players = (
    db
      .prepare("SELECT * FROM game_players WHERE game_id = ? ORDER BY seat")
      .all(id) as PlayerRow[]
  ).map(
    (r): GamePlayer => ({
      seat: r.seat,
      nickname: r.nickname,
      characterId: r.character_id,
      alignment: r.alignment as GamePlayer["alignment"],
      x: r.x,
      y: r.y,
      locked: !!r.locked,
      status: r.status,
      markers: JSON.parse(r.markers) as string[],
    }),
  );
  return {
    id: g.id,
    sheetId: g.sheet_id,
    sheetName: g.sheet_name,
    status: g.status,
    phase: g.phase,
    day: g.day,
    result: g.result,
    players,
  };
}

export function savePositions(
  gameId: string,
  positions: { seat: number; x: number; y: number }[],
): void {
  const db = getDb();
  const upd = db.prepare(
    "UPDATE game_players SET x = ?, y = ? WHERE game_id = ? AND seat = ?",
  );
  const touch = db.prepare("UPDATE games SET updated_at = ? WHERE id = ?");
  const tx = db.transaction(() => {
    for (const p of positions) upd.run(p.x, p.y, gameId, p.seat);
    touch.run(new Date().toISOString(), gameId);
  });
  tx();
}

export function listGames(): {
  id: string;
  sheetName: string;
  status: string;
  playerCount: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT g.id, g.sheet_name AS sheetName, g.status,
              (SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id) AS playerCount
       FROM games g ORDER BY g.created_at DESC`,
    )
    .all() as { id: string; sheetName: string; status: string; playerCount: number }[];
}
