// 룸 채팅 — 서버 전용. 로비부터 게임까지 같은 room_id로 이어지는 채팅.
// 전체 채팅 + 귓말(recipient): 귓말은 발신자·수신자·이야기꾼(방장)만 본다.
import { db, now } from "./games/schema";

export type ChatMessage = {
  id: number;
  userId: number;
  nickname: string;
  body: string;
  /** 귓말 수신자 user id. null/undefined면 전체 채팅. */
  recipientUserId: number | null;
  recipientNickname: string;
  createdAt: string;
};

/** 메시지 저장. body는 호출측에서 trim·길이 제한. recipient 지정 시 귓말. id 반환. */
export function postMessage(input: {
  roomId: string;
  userId: number;
  nickname: string;
  body: string;
  recipientUserId?: number | null;
  recipientNickname?: string;
}): number {
  const info = db
    .prepare(
      `INSERT INTO game_messages (room_id,user_id,nickname,body,recipient_user_id,recipient_nickname,created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      input.roomId,
      input.userId,
      input.nickname,
      input.body,
      input.recipientUserId ?? null,
      input.recipientNickname ?? "",
      now(),
    );
  return Number(info.lastInsertRowid);
}

type Row = {
  id: number;
  user_id: number;
  nickname: string;
  body: string;
  recipient_user_id: number | null;
  recipient_nickname: string;
  created_at: string;
};

const toMsg = (r: Row): ChatMessage => ({
  id: r.id,
  userId: r.user_id,
  nickname: r.nickname,
  body: r.body,
  recipientUserId: r.recipient_user_id,
  recipientNickname: r.recipient_nickname,
  createdAt: r.created_at,
});

/**
 * 뷰어가 볼 수 있는 최근 메시지(오래된 → 최신).
 * - 이야기꾼(isOwner): 전체 채팅 + 모든 귓말.
 * - 플레이어: 전체 채팅 + 본인이 보내거나 받은 귓말만.
 */
export function listMessages(
  roomId: string,
  viewerUserId: number,
  isOwner: boolean,
  limit = 200,
): ChatMessage[] {
  const rows = isOwner
    ? (db
        .prepare("SELECT * FROM game_messages WHERE room_id = ? ORDER BY id DESC LIMIT ?")
        .all(roomId, limit) as Row[])
    : (db
        .prepare(
          `SELECT * FROM game_messages
            WHERE room_id = ?
              AND (recipient_user_id IS NULL OR user_id = ? OR recipient_user_id = ?)
            ORDER BY id DESC LIMIT ?`,
        )
        .all(roomId, viewerUserId, viewerUserId, limit) as Row[]);
  return rows.map(toMsg).reverse();
}

export function deleteMessages(roomId: string): void {
  db.prepare("DELETE FROM game_messages WHERE room_id = ?").run(roomId);
}
