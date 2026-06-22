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
import { createGame, getGame, seatForUser } from "@/lib/games";
import {
  acknowledge,
  cancelRequest,
  createRequest,
  deliver,
  getActiveForSeat,
  getRequest,
  listActive,
  listAllForGame,
  listAllForSeat,
  respond,
  type InfoPayload,
  type NightRequest,
  type NightRequestKind,
} from "@/lib/night-requests";
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

// ── 채팅(룸 멤버) — 전체 + 귓말 ──
export async function getMessagesAction(roomId: string): Promise<ChatMessage[]> {
  const { user, room } = await requireRoomMember(roomId);
  // 이야기꾼(방장)은 귓말 포함 전부, 플레이어는 전체 + 본인 관련 귓말만.
  return listMessages(room.id, user.id, room.ownerId === user.id);
}

export async function sendChatAction(
  roomId: string,
  body: string,
  recipientUserId?: number | null,
): Promise<{ error: string } | void> {
  const { user, room } = await requireRoomMember(roomId);
  const text = body.trim().slice(0, 1000);
  if (!text) return;
  let recipient: { id: number; nickname: string } | null = null;
  if (recipientUserId != null) {
    const target = room.members.find((m) => m.userId === recipientUserId);
    if (!target) return { error: "귓말 대상을 찾을 수 없습니다." };
    if (target.userId === user.id) return; // 자기 자신 귓말은 무시
    recipient = { id: target.userId, nickname: target.nickname };
  }
  postMessage({
    roomId: room.id,
    userId: user.id,
    nickname: user.nickname,
    body: text,
    recipientUserId: recipient?.id ?? null,
    recipientNickname: recipient?.nickname ?? "",
  });
  emitRoomUpdate(room.id); // 룸 채널 구독자(로비·채팅 위젯) 즉시 갱신
}

// ── 밤 행동 요청/응답(P5) ──
function sanitizeInfo(info: InfoPayload): InfoPayload {
  return {
    heading: String(info.heading ?? "").slice(0, 300),
    subheading: info.subheading ? String(info.subheading).slice(0, 300) : undefined,
    roleTokens: (info.roleTokens ?? []).slice(0, 8).map((s) => String(s).slice(0, 64)),
    nameTokens: (info.nameTokens ?? []).slice(0, 12).map((s) => String(s).slice(0, 60)),
  };
}

/** ST가 좌석에 밤 행동 요청 생성(정보 즉시 전달 또는 행동 요청). */
export async function createNightRequestAction(
  roomId: string,
  input: { seat: number; kind: NightRequestKind; prompt?: string; maxTargets?: number; info?: InfoPayload },
): Promise<{ error: string } | { id: string }> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  // info(즉시 전달)는 반드시 표시할 내용이 있어야 한다 — 빈 info면 플레이어가 막힌 모달에 갇힐 수 있다.
  if (input.kind === "info" && (!input.info || !input.info.heading?.trim()))
    return { error: "보낼 정보(큰 메시지)를 입력하세요." };
  const id = createRequest({
    gameId: room.gameId,
    seat: input.seat,
    kind: input.kind,
    prompt: (input.prompt ?? "").slice(0, 300),
    maxTargets: Math.max(0, Math.min(10, input.maxTargets ?? 1)),
    info: input.kind === "info" && input.info ? sanitizeInfo(input.info) : undefined,
  });
  emitGameUpdate(room.gameId);
  return { id };
}

/** 플레이어 응답 — 본인 좌석의 요청에만. */
export async function respondNightRequestAction(
  roomId: string,
  requestId: string,
  targets: number[],
  choice: string,
): Promise<{ error: string } | void> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  const req = getRequest(requestId);
  if (!req || req.gameId !== room.gameId) return { error: "요청을 찾을 수 없습니다." };
  if (seatForUser(room.gameId, user.id) !== req.seat) return { error: "본인 좌석의 요청이 아닙니다." };
  // 좌석 수 클램프 + 실제 존재하는 좌석만 허용(잘못된 값으로 콘솔 표시 오염 방지).
  const validSeats = new Set(getGame(room.gameId)?.players.map((p) => p.seat) ?? []);
  const safeTargets = (targets ?? [])
    .slice(0, req.maxTargets)
    .map((n) => Number(n) | 0)
    .filter((s) => validSeats.has(s));
  respond(requestId, safeTargets, String(choice ?? "").slice(0, 64));
  emitGameUpdate(room.gameId);
}

/** ST 최종 정보 전달. */
export async function deliverNightRequestAction(
  roomId: string,
  requestId: string,
  info: InfoPayload,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  const req = getRequest(requestId);
  if (!req || req.gameId !== room.gameId) return { error: "요청을 찾을 수 없습니다." };
  deliver(requestId, sanitizeInfo(info));
  emitGameUpdate(room.gameId);
}

/** 플레이어가 전달된 정보를 확인. */
export async function acknowledgeNightRequestAction(
  roomId: string,
  requestId: string,
): Promise<{ error: string } | void> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return;
  const req = getRequest(requestId);
  if (!req || req.gameId !== room.gameId) return;
  if (seatForUser(room.gameId, user.id) !== req.seat) return { error: "본인 좌석의 요청이 아닙니다." };
  acknowledge(requestId);
  emitGameUpdate(room.gameId);
}

export async function cancelNightRequestAction(
  roomId: string,
  requestId: string,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  // 다른 게임의 요청을 id만으로 취소하지 못하게 소속 검사(다른 핸들러와 동일).
  const req = getRequest(requestId);
  if (!req || req.gameId !== room.gameId) return { error: "요청을 찾을 수 없습니다." };
  cancelRequest(requestId);
  if (room.gameId) emitGameUpdate(room.gameId);
}

/** 플레이어: 본인 좌석의 활성 요청을 가져온다(본인 것만). */
export async function getMyRequestAction(roomId: string): Promise<NightRequest | null> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return null;
  const seat = seatForUser(room.gameId, user.id);
  if (seat == null) return null;
  return getActiveForSeat(room.gameId, seat) ?? null;
}

/** ST: 게임의 모든 활성 요청. */
export async function listNightRequestsAction(roomId: string): Promise<NightRequest[]> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return [];
  return listActive(room.gameId);
}

/** ST: 게임의 밤 행동 기록(전체, 최근 순). */
export async function listNightRequestHistoryAction(roomId: string): Promise<NightRequest[]> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return [];
  return listAllForGame(room.gameId);
}

/** 플레이어: 본인 좌석의 밤 행동 기록(받은 정보 다시 보기). */
export async function getMyRequestHistoryAction(roomId: string): Promise<NightRequest[]> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return [];
  const seat = seatForUser(room.gameId, user.id);
  if (seat == null) return [];
  return listAllForSeat(room.gameId, seat);
}
