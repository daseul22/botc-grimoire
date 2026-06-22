// 룸 전체 채팅 — 서버 전용. 로비부터 게임까지 같은 room_id로 이어지는 단일 전체채팅.
import { db, now } from "./games/schema";

export type ChatMessage = {
  id: number;
  userId: number;
  nickname: string;
  body: string;
  createdAt: string;
};

/** 메시지 저장. body는 호출측에서 trim·길이 제한. id 반환. */
export function postMessage(
  roomId: string,
  userId: number,
  nickname: string,
  body: string,
): number {
  const info = db
    .prepare(
      "INSERT INTO game_messages (room_id,user_id,nickname,body,created_at) VALUES (?,?,?,?,?)",
    )
    .run(roomId, userId, nickname, body, now());
  return Number(info.lastInsertRowid);
}

/** 최근 메시지 목록(오래된 → 최신). 기본 최근 200개. */
export function listMessages(roomId: string, limit = 200): ChatMessage[] {
  const rows = db
    .prepare(
      "SELECT id, user_id, nickname, body, created_at FROM game_messages WHERE room_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(roomId, limit) as {
    id: number;
    user_id: number;
    nickname: string;
    body: string;
    created_at: string;
  }[];
  return rows
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      nickname: r.nickname,
      body: r.body,
      createdAt: r.created_at,
    }))
    .reverse();
}

/** 룸 삭제/정리 시 메시지 제거. */
export function deleteMessages(roomId: string): void {
  db.prepare("DELETE FROM game_messages WHERE room_id = ?").run(roomId);
}
