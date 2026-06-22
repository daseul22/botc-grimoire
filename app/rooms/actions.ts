"use server";

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getUserById,
  isAdmin,
  isStoryteller,
  userIdByNickname,
  type AuthUser,
} from "@/lib/auth";
import { createGame } from "@/lib/games";
import { assignRoles, resolveSheet } from "@/lib/role-assign";
import { circlePositions } from "@/lib/seat-layout";
import { ratioTotal, type Ratio } from "@/lib/ratio";
import { emitRoomUpdate, emitGameUpdate } from "@/lib/realtime";
import {
  addMember,
  assignSeat,
  closeRoom,
  createInvite,
  createRoom,
  getInvite,
  getRoom,
  getRoomByCode,
  isMember,
  markRoomStarted,
  removeMember,
  setInviteStatus,
  setRoomConfig,
  touchMember,
  type Room,
} from "@/lib/rooms";
import { setGeneralMemo, setGuess, setSeatNote } from "@/lib/player-board";
import { listMessages, postMessage, type ChatMessage } from "@/lib/chat";

// 방장(이야기꾼) 또는 관리자만. 미인가 시 throw(서버 액션은 공개 POST라 UI 게이팅과 별개로 강제).
async function requireRoomOwner(roomId: string): Promise<{ user: AuthUser; room: Room }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const room = getRoom(roomId);
  if (!room) throw new Error("방을 찾을 수 없습니다.");
  if (!isAdmin(user) && room.ownerId !== user.id)
    throw new Error("이 방을 조작할 권한이 없습니다.");
  return { user, room };
}

/** 온라인 방 생성 — 이야기꾼·관리자만. 방장은 storyteller 멤버로 함께 등록된다. */
export async function createRoomAction(sheetId: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user || !isStoryteller(user))
    return { error: "온라인 방 생성은 이야기꾼 또는 관리자만 가능합니다." };
  const sheet = resolveSheet(sheetId);
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };
  const roomId = createRoom({
    ownerId: user.id,
    ownerNickname: user.nickname,
    sheetId: sheet.id,
    sheetName: sheet.name.ko,
  });
  redirect(`/rooms/${roomId}`);
}

/** 입장 코드로 방 참가(로그인 필수). 가입자라면 누구나 코드로 들어올 수 있다. */
export async function joinRoomByCodeAction(code: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const room = getRoomByCode(code);
  if (!room) return { error: "해당 코드의 방이 없습니다." };
  if (room.status !== "lobby") return { error: "이미 시작했거나 닫힌 방입니다." };
  addMember(room.id, user.id, user.nickname, room.ownerId === user.id ? "storyteller" : "player");
  emitRoomUpdate(room.id);
  redirect(`/rooms/${room.id}`);
}

/** 지정 초대 — 방장이 닉네임으로 가입 계정을 초대. 당사자는 /rooms에서 수락한다. */
export async function sendInviteAction(
  roomId: string,
  nickname: string,
): Promise<{ error: string } | { ok: true }> {
  const { room } = await requireRoomOwner(roomId);
  const uid = userIdByNickname(nickname);
  if (uid == null) return { error: `'${nickname}' 닉네임의 가입 계정을 찾을 수 없습니다.` };
  if (uid === room.ownerId) return { error: "방장은 초대할 수 없습니다." };
  createInvite(roomId, uid);
  emitRoomUpdate(roomId);
  return { ok: true };
}

export async function acceptInviteAction(inviteId: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const invite = getInvite(inviteId);
  if (!invite) return { error: "초대를 찾을 수 없습니다." };
  if (invite.invitedUserId !== user.id) return { error: "본인에게 온 초대가 아닙니다." };
  const room = getRoom(invite.roomId);
  if (!room || room.status !== "lobby") return { error: "이미 시작했거나 닫힌 방입니다." };
  addMember(room.id, user.id, user.nickname);
  setInviteStatus(inviteId, "accepted");
  emitRoomUpdate(room.id);
  redirect(`/rooms/${room.id}`);
}

export async function declineInviteAction(inviteId: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const invite = getInvite(inviteId);
  if (!invite || invite.invitedUserId !== user.id) return { error: "초대를 찾을 수 없습니다." };
  setInviteStatus(inviteId, "declined");
  emitRoomUpdate(invite.roomId);
}

/** 좌석 배정/해제 — 방장만. seat=null이면 해제(관전/대기). */
export async function assignSeatAction(
  roomId: string,
  userId: number,
  seat: number | null,
): Promise<{ error: string } | void> {
  await requireRoomOwner(roomId);
  assignSeat(roomId, userId, seat);
  emitRoomUpdate(roomId);
}

export async function kickMemberAction(
  roomId: string,
  userId: number,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  if (userId === room.ownerId) return { error: "방장은 내보낼 수 없습니다." };
  removeMember(roomId, userId);
  emitRoomUpdate(roomId);
}

/** 방 나가기 — 방장이 나가면 방을 닫는다. */
export async function leaveRoomAction(roomId: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const room = getRoom(roomId);
  if (!room) return;
  if (room.ownerId === user.id) closeRoom(roomId);
  else removeMember(roomId, user.id);
  emitRoomUpdate(roomId);
  redirect("/rooms");
}

export async function closeRoomAction(roomId: string): Promise<{ error: string } | void> {
  await requireRoomOwner(roomId);
  closeRoom(roomId);
  emitRoomUpdate(roomId);
  redirect("/rooms");
}

/**
 * 시작 — 좌석 배정된 멤버들로 게임을 만든다.
 * 로비 좌석 번호 순서대로 0..n-1로 재배치하고, 기존 createGame에 userId 바인딩을 넘긴다.
 * 시작 후 로비 SSE로 플레이어들이 게임 좌석 뷰로 이동한다.
 */
export async function startRoomAction(
  roomId: string,
  input: { excludedIds: string[]; counts: Ratio },
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  if (room.status !== "lobby") return { error: "이미 시작한 방입니다." };
  const sheet = resolveSheet(room.sheetId);
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };

  const seated = room.members
    .filter((m) => m.seat != null)
    .sort((a, b) => (a.seat as number) - (b.seat as number));
  if (seated.length < 5) return { error: "최소 5명을 좌석에 배정해야 시작할 수 있습니다." };
  if (ratioTotal(input.counts) !== seated.length)
    return { error: "직업군 비율 합이 좌석 배정 인원과 다릅니다." };

  const res = assignRoles(sheet, input.excludedIds, input.counts);
  if ("error" in res) return res;

  // 닉네임은 시작 시점의 현재 계정 닉네임으로(로비 가입 후 닉네임 변경 대비). 없으면 스냅샷.
  const nicknames = seated.map((m) => getUserById(m.userId)?.nickname ?? m.nickname);
  const userIds = seated.map((m) => m.userId);
  const pts = circlePositions(seated.length);
  const players = res.roles.map((r) => ({
    seat: r.seat,
    nickname: nicknames[r.seat],
    characterId: r.characterId,
    alignment: r.alignment as "good" | "evil",
    x: pts[r.seat].x,
    y: pts[r.seat].y,
    userId: userIds[r.seat],
  }));

  const gameId = createGame({
    sheetId: room.sheetId,
    sheetName: room.sheetName,
    config: { excludedIds: input.excludedIds, counts: input.counts },
    players,
    ownerId: room.ownerId,
  });
  setRoomConfig(roomId, { excludedIds: input.excludedIds, counts: input.counts });
  markRoomStarted(roomId, gameId);
  emitRoomUpdate(roomId);
  emitGameUpdate(gameId);
  // 온라인 진행은 기존 /play와 별도 라우트.
  redirect(`/rooms/${roomId}/play`);
}

/** 접속 생존 신호(빈번하므로 emit 안 함). 로비에서 주기적으로 호출. */
export async function heartbeatRoomAction(roomId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  touchMember(roomId, user.id);
}

// ── 플레이어 개인 추측/메모(마스킹 보드) — 룸 멤버 본인 것만. emit 안 함(사적). ──
async function requireRoomMember(roomId: string): Promise<{ user: AuthUser; room: Room }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const room = getRoom(roomId);
  if (!room) throw new Error("방을 찾을 수 없습니다.");
  if (room.ownerId !== user.id && !isMember(room.id, user.id))
    throw new Error("이 방의 멤버가 아닙니다.");
  return { user, room };
}

export async function setGuessAction(
  roomId: string,
  seat: number,
  guessCharId: string,
): Promise<void> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return;
  setGuess(room.gameId, user.id, seat, guessCharId.slice(0, 64));
}

export async function setSeatNoteAction(
  roomId: string,
  seat: number,
  note: string,
): Promise<void> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return;
  setSeatNote(room.gameId, user.id, seat, note.slice(0, 500));
}

export async function setGeneralMemoAction(roomId: string, note: string): Promise<void> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return;
  setGeneralMemo(room.gameId, user.id, note.slice(0, 2000));
}

// ── 전체 채팅(룸 멤버) ──
export async function getMessagesAction(roomId: string): Promise<ChatMessage[]> {
  await requireRoomMember(roomId);
  return listMessages(roomId);
}

export async function sendChatAction(
  roomId: string,
  body: string,
): Promise<{ error: string } | void> {
  const { user, room } = await requireRoomMember(roomId);
  const text = body.trim().slice(0, 1000);
  if (!text) return;
  postMessage(room.id, user.id, user.nickname, text);
  emitRoomUpdate(room.id); // 룸 채널 구독자(로비·채팅 위젯) 즉시 갱신
}
