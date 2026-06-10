import { db, now } from "./schema";

// 실행 취소 — 조작 전 게임 전체 상태(games 행 + 좌석 + 페이즈 + 행동)를 통째로
// 스냅샷해 스택에 쌓고, undo 시 그대로 복원한다.
// 게임당 행 수가 작아(좌석 ~15, 페이즈 ~20) 통짜 직렬화가 부분 diff보다 단순하고 견고하다.

const MAX_STACK = 30;

type UndoSnapshot = {
  game: Record<string, unknown>;
  players: Record<string, unknown>[];
  phases: Record<string, unknown>[];
  phaseActions: Record<string, unknown>[];
};

function snapshot(gameId: string): UndoSnapshot | null {
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId) as
    | Record<string, unknown>
    | undefined;
  if (!game) return null;
  return {
    game,
    players: db
      .prepare("SELECT * FROM game_players WHERE game_id = ?")
      .all(gameId) as Record<string, unknown>[],
    phases: db
      .prepare("SELECT * FROM game_phases WHERE game_id = ?")
      .all(gameId) as Record<string, unknown>[],
    phaseActions: db
      .prepare("SELECT * FROM game_phase_actions WHERE game_id = ?")
      .all(gameId) as Record<string, unknown>[],
  };
}

function insertRows(table: string, rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const cols = Object.keys(row);
    db.prepare(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    ).run(...cols.map((c) => row[c]));
  }
}

/** 조작 직전 호출 — 현재 상태를 undo 스택에 push. */
export function captureUndo(gameId: string, label: string): void {
  const snap = snapshot(gameId);
  if (!snap) return;
  db.transaction(() => {
    db.prepare(
      "INSERT INTO game_undo_stack (game_id, label, data, created_at) VALUES (?,?,?,?)",
    ).run(gameId, label, JSON.stringify(snap), now());
    // 게임당 최근 MAX_STACK개만 유지
    db.prepare(
      `DELETE FROM game_undo_stack WHERE game_id = ? AND id NOT IN (
         SELECT id FROM game_undo_stack WHERE game_id = ? ORDER BY id DESC LIMIT ?)`,
    ).run(gameId, gameId, MAX_STACK);
  })();
}

/** 최근 스냅샷으로 복원. 복원한 조작의 label을 반환(스택 비면 null). */
export function undoLast(gameId: string): string | null {
  const top = db
    .prepare("SELECT id, label, data FROM game_undo_stack WHERE game_id = ? ORDER BY id DESC LIMIT 1")
    .get(gameId) as { id: number; label: string; data: string } | undefined;
  if (!top) return null;
  const snap = JSON.parse(top.data) as UndoSnapshot;
  db.transaction(() => {
    db.prepare("DELETE FROM games WHERE id = ?").run(gameId);
    db.prepare("DELETE FROM game_players WHERE game_id = ?").run(gameId);
    db.prepare("DELETE FROM game_phases WHERE game_id = ?").run(gameId);
    db.prepare("DELETE FROM game_phase_actions WHERE game_id = ?").run(gameId);
    insertRows("games", [snap.game]);
    insertRows("game_players", snap.players);
    insertRows("game_phases", snap.phases);
    insertRows("game_phase_actions", snap.phaseActions);
    db.prepare("DELETE FROM game_undo_stack WHERE id = ?").run(top.id);
  })();
  return top.label;
}

/** 스택 깊이 + 최근 조작 라벨 (undo 버튼 활성/툴팁용). */
export function undoInfo(gameId: string): { count: number; lastLabel: string | null } {
  const count = (
    db.prepare("SELECT COUNT(*) c FROM game_undo_stack WHERE game_id = ?").get(gameId) as {
      c: number;
    }
  ).c;
  const last = count
    ? (
        db
          .prepare("SELECT label FROM game_undo_stack WHERE game_id = ? ORDER BY id DESC LIMIT 1")
          .get(gameId) as { label: string }
      ).label
    : null;
  return { count, lastLabel: last };
}

export function clearUndo(gameId: string): void {
  db.prepare("DELETE FROM game_undo_stack WHERE game_id = ?").run(gameId);
}
