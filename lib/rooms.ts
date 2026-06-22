// 온라인 플레이 룸(로비) 데이터 레이어 — 서버 전용(better-sqlite3).
//
// 게임은 "시작" 순간에 기존 createGame으로 만들어진다. 그 전 단계인 로비(가입자 모집·좌석 배정·
// 비율 설정)를 이 모듈이 담당한다. 좌석↔계정 바인딩은 게임 생성 시 game_players.user_id로 넘어간다.
//
// 시작 오케스트레이션(직업 배정 + createGame + 링크)은 서버 액션(app/rooms/actions.ts)에 둔다.
// 이 모듈은 순수 데이터 CRUD만 — 직업 데이터/배정 로직에 의존하지 않는다.

import { db, now } from "./games/schema";

export type RoomStatus = "lobby" | "started" | "closed";
export type RoomMemberRole = "storyteller" | "player" | "spectator";

export type RoomMember = {
  userId: number;
  nickname: string;
  role: RoomMemberRole;
  /** 배정 좌석. null = 미배정(관전/대기). */
  seat: number | null;
  lastSeenAt: string;
};

export type RoomConfig = { excludedIds: string[]; counts: Record<string, number> };

export type Room = {
  id: string;
  code: string;
  ownerId: number;
  sheetId: string;
  sheetName: string;
  status: RoomStatus;
  gameId: string | null;
  config: RoomConfig | null;
  members: RoomMember[];
  createdAt: string;
};

export type RoomInvite = {
  id: string;
  roomId: string;
  invitedUserId: number;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
};

type RoomRow = {
  id: string;
  code: string;
  owner_id: number;
  sheet_id: string;
  sheet_name: string;
  status: RoomStatus;
  game_id: string | null;
  config: string | null;
  created_at: string;
};
type MemberRow = {
  user_id: number;
  nickname: string;
  role: RoomMemberRole;
  seat: number | null;
  last_seen_at: string;
};

// 혼동되는 글자(I,O,0,1) 제외한 입장 코드 알파벳.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}
function uniqueCode(): string {
  // UNIQUE 충돌 시 재시도(사실상 즉시 성공). 안전 상한.
  for (let i = 0; i < 20; i++) {
    const code = genCode();
    const taken = db.prepare("SELECT 1 FROM game_rooms WHERE code = ?").get(code);
    if (!taken) return code;
  }
  throw new Error("입장 코드 생성에 실패했습니다.");
}

function readMembers(roomId: string): RoomMember[] {
  const rows = db
    .prepare(
      "SELECT user_id, nickname, role, seat, last_seen_at FROM game_room_members WHERE room_id = ? ORDER BY (seat IS NULL), seat, joined_at",
    )
    .all(roomId) as MemberRow[];
  return rows.map((r) => ({
    userId: r.user_id,
    nickname: r.nickname,
    role: r.role,
    seat: r.seat ?? null,
    lastSeenAt: r.last_seen_at,
  }));
}

function rowToRoom(r: RoomRow): Room {
  return {
    id: r.id,
    code: r.code,
    ownerId: r.owner_id,
    sheetId: r.sheet_id,
    sheetName: r.sheet_name,
    status: r.status,
    gameId: r.game_id,
    config: r.config ? (JSON.parse(r.config) as RoomConfig) : null,
    members: readMembers(r.id),
    createdAt: r.created_at,
  };
}

// ── 룸 ──

/** 룸 생성 — 방장(이야기꾼)을 storyteller 멤버로 함께 등록. roomId 반환. */
export function createRoom(input: {
  ownerId: number;
  ownerNickname: string;
  sheetId: string;
  sheetName: string;
}): string {
  const id = "r-" + crypto.randomUUID().slice(0, 8);
  const code = uniqueCode();
  const t = now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO game_rooms (id,code,owner_id,sheet_id,sheet_name,status,game_id,config,created_at,updated_at)
       VALUES (?,?,?,?,?,'lobby',NULL,NULL,?,?)`,
    ).run(id, code, input.ownerId, input.sheetId, input.sheetName, t, t);
    db.prepare(
      `INSERT INTO game_room_members (room_id,user_id,nickname,role,seat,joined_at,last_seen_at)
       VALUES (?,?,?,'storyteller',NULL,?,?)`,
    ).run(id, input.ownerId, input.ownerNickname, t, t);
  })();
  return id;
}

export function getRoom(roomId: string): Room | undefined {
  const r = db.prepare("SELECT * FROM game_rooms WHERE id = ?").get(roomId) as RoomRow | undefined;
  return r ? rowToRoom(r) : undefined;
}

export function getRoomByCode(code: string): Room | undefined {
  const r = db
    .prepare("SELECT * FROM game_rooms WHERE code = ?")
    .get(code.trim().toUpperCase()) as RoomRow | undefined;
  return r ? rowToRoom(r) : undefined;
}

export function getRoomByGameId(gameId: string): Room | undefined {
  const r = db.prepare("SELECT * FROM game_rooms WHERE game_id = ?").get(gameId) as
    | RoomRow
    | undefined;
  return r ? rowToRoom(r) : undefined;
}

/** 룸(온라인)에서 시작된 게임 id 집합 — 기존 /games 내역에서 온라인 게임을 제외할 때 사용. */
export function onlineGameIds(): Set<string> {
  const rows = db
    .prepare("SELECT game_id FROM game_rooms WHERE game_id IS NOT NULL")
    .all() as { game_id: string }[];
  return new Set(rows.map((r) => r.game_id));
}

/** 사용자가 방장이거나 멤버인 활성(lobby/started) 룸들. */
export function listRoomsForUser(userId: number): { owned: Room[]; joined: Room[] } {
  const owned = (
    db
      .prepare("SELECT * FROM game_rooms WHERE owner_id = ? AND status != 'closed' ORDER BY updated_at DESC")
      .all(userId) as RoomRow[]
  ).map(rowToRoom);
  const joined = (
    db
      .prepare(
        `SELECT gr.* FROM game_rooms gr
         JOIN game_room_members m ON m.room_id = gr.id
         WHERE m.user_id = ? AND gr.owner_id != ? AND gr.status != 'closed'
         ORDER BY gr.updated_at DESC`,
      )
      .all(userId, userId) as RoomRow[]
  ).map(rowToRoom);
  return { owned, joined };
}

function touchRoom(roomId: string): void {
  db.prepare("UPDATE game_rooms SET updated_at = ? WHERE id = ?").run(now(), roomId);
}

export function setRoomConfig(roomId: string, config: RoomConfig): void {
  db.prepare("UPDATE game_rooms SET config = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(config),
    now(),
    roomId,
  );
}

/** 룸을 게임에 연결하고 started로 전환. */
export function markRoomStarted(roomId: string, gameId: string): void {
  db.prepare(
    "UPDATE game_rooms SET status = 'started', game_id = ?, updated_at = ? WHERE id = ?",
  ).run(gameId, now(), roomId);
}

export function closeRoom(roomId: string): void {
  db.transaction(() => {
    db.prepare("UPDATE game_rooms SET status = 'closed', updated_at = ? WHERE id = ?").run(
      now(),
      roomId,
    );
    // 닫힌 룸의 초대·채팅은 더 이상 의미가 없으니 정리(죽은 행 누적 방지).
    db.prepare("DELETE FROM game_invites WHERE room_id = ?").run(roomId);
    db.prepare("DELETE FROM game_messages WHERE room_id = ?").run(roomId);
  })();
}

// ── 멤버 ──

/** 멤버 추가(이미 있으면 닉네임·last_seen만 갱신). 좌석은 건드리지 않는다. */
export function addMember(
  roomId: string,
  userId: number,
  nickname: string,
  role: RoomMemberRole = "player",
): void {
  const t = now();
  const exists = db
    .prepare("SELECT 1 FROM game_room_members WHERE room_id = ? AND user_id = ?")
    .get(roomId, userId);
  if (exists) {
    db.prepare(
      "UPDATE game_room_members SET nickname = ?, last_seen_at = ? WHERE room_id = ? AND user_id = ?",
    ).run(nickname, t, roomId, userId);
  } else {
    db.prepare(
      `INSERT INTO game_room_members (room_id,user_id,nickname,role,seat,joined_at,last_seen_at)
       VALUES (?,?,?,?,NULL,?,?)`,
    ).run(roomId, userId, nickname, role, t, t);
  }
  touchRoom(roomId);
}

export function isMember(roomId: string, userId: number): boolean {
  return !!db
    .prepare("SELECT 1 FROM game_room_members WHERE room_id = ? AND user_id = ?")
    .get(roomId, userId);
}

export function removeMember(roomId: string, userId: number): void {
  db.prepare("DELETE FROM game_room_members WHERE room_id = ? AND user_id = ?").run(roomId, userId);
  touchRoom(roomId);
}

/**
 * 멤버를 좌석에 배정(null=해제). 같은 좌석을 이미 다른 멤버가 가졌으면 그 멤버를 먼저 비워
 * 한 좌석당 한 명을 보장한다(이야기꾼이 좌석을 옮기는 조작).
 */
export function assignSeat(roomId: string, userId: number, seat: number | null): void {
  db.transaction(() => {
    if (seat !== null) {
      db.prepare(
        "UPDATE game_room_members SET seat = NULL WHERE room_id = ? AND seat = ? AND user_id != ?",
      ).run(roomId, seat, userId);
    }
    db.prepare(
      "UPDATE game_room_members SET seat = ?, role = 'player' WHERE room_id = ? AND user_id = ?",
    ).run(seat, roomId, userId);
  })();
  touchRoom(roomId);
}

export function touchMember(roomId: string, userId: number): void {
  db.prepare(
    "UPDATE game_room_members SET last_seen_at = ? WHERE room_id = ? AND user_id = ?",
  ).run(now(), roomId, userId);
}

// ── 초대 ──

/** 지정 초대 생성(이미 pending이면 그대로 반환). inviteId 반환. */
export function createInvite(roomId: string, invitedUserId: number): string {
  const existing = db
    .prepare("SELECT id, status FROM game_invites WHERE room_id = ? AND invited_user_id = ?")
    .get(roomId, invitedUserId) as { id: string; status: string } | undefined;
  if (existing) {
    if (existing.status !== "pending") {
      db.prepare("UPDATE game_invites SET status = 'pending', created_at = ? WHERE id = ?").run(
        now(),
        existing.id,
      );
    }
    return existing.id;
  }
  const id = "i-" + crypto.randomUUID().slice(0, 8);
  db.prepare(
    "INSERT INTO game_invites (id,room_id,invited_user_id,status,created_at) VALUES (?,?,?,'pending',?)",
  ).run(id, roomId, invitedUserId, now());
  return id;
}

export function getInvite(inviteId: string): RoomInvite | undefined {
  const r = db.prepare("SELECT * FROM game_invites WHERE id = ?").get(inviteId) as
    | { id: string; room_id: string; invited_user_id: number; status: RoomInvite["status"]; created_at: string }
    | undefined;
  return r
    ? { id: r.id, roomId: r.room_id, invitedUserId: r.invited_user_id, status: r.status, createdAt: r.created_at }
    : undefined;
}

export function listInvitesForRoom(roomId: string): RoomInvite[] {
  return (
    db.prepare("SELECT * FROM game_invites WHERE room_id = ? ORDER BY created_at DESC").all(roomId) as {
      id: string;
      room_id: string;
      invited_user_id: number;
      status: RoomInvite["status"];
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    roomId: r.room_id,
    invitedUserId: r.invited_user_id,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** 사용자에게 온 pending 초대들 + 룸 정보. 닫힌/시작된 룸의 초대는 제외. */
export function listPendingInvitesForUser(
  userId: number,
): { invite: RoomInvite; room: Room }[] {
  const rows = db
    .prepare(
      `SELECT i.id FROM game_invites i
       JOIN game_rooms gr ON gr.id = i.room_id
       WHERE i.invited_user_id = ? AND i.status = 'pending' AND gr.status = 'lobby'
         AND NOT EXISTS (
           SELECT 1 FROM game_room_members m
           WHERE m.room_id = i.room_id AND m.user_id = i.invited_user_id
         )
       ORDER BY i.created_at DESC`,
    )
    .all(userId) as { id: string }[];
  const out: { invite: RoomInvite; room: Room }[] = [];
  for (const { id } of rows) {
    const invite = getInvite(id);
    if (!invite) continue;
    const room = getRoom(invite.roomId);
    if (room) out.push({ invite, room });
  }
  return out;
}

export function setInviteStatus(inviteId: string, status: RoomInvite["status"]): void {
  db.prepare("UPDATE game_invites SET status = ? WHERE id = ?").run(status, inviteId);
}
