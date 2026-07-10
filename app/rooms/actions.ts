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
import {
  captureUndo,
  createGame,
  getGame,
  recordVote,
  seatForUser,
  setNominationsOpen,
  setStatus,
  setTimerDuration,
  startTimer,
  stopTimer,
  type TimerKind,
} from "@/lib/games";
import {
  advance,
  cancel as cancelNomination,
  cancelStale,
  countUp,
  getActive as getActiveNomination,
  getById as getNomination,
  listForDay,
  markCommitted,
  openNomination,
  pause as pauseNomination,
  resume as resumeNomination,
  setHand,
  setPace,
  startVote,
  type Nomination,
} from "@/lib/nominations";
import {
  acknowledge,
  cancelRequest,
  createRequest,
  getActiveForSeat,
  getRequest,
  listActive,
  listAllForGame,
  listAllForSeat,
  respond,
  type NightRequest,
  type NightRequestKind,
} from "@/lib/night-requests";
import { resolveShowcase } from "@/lib/showcase";
import { characterMapForGame } from "@/lib/game-characters";
import { specForPhase } from "@/lib/night-actions";
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
  setMemberColor,
  setRoomConfig,
  touchMember,
  type Room,
} from "@/lib/rooms";
import { isPlayerColor } from "@/lib/player-colors";
import { setGeneralMemo, setGuess, setSeatNote } from "@/lib/player-board";
import { listMessages, postMessage, type ChatMessage } from "@/lib/chat";
import { chatGate, openTimerRunning } from "@/lib/chat-policy";

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

/** 멤버 닉네임 구분 색 지정 — 방장(이야기꾼)만. 채팅·보드에서 플레이어 구분용. */
export async function setMemberColorAction(
  roomId: string,
  userId: number,
  colorId: string,
): Promise<{ error: string } | { ok: true }> {
  const { room } = await requireRoomOwner(roomId);
  if (!isPlayerColor(colorId)) return { error: "알 수 없는 색상입니다." };
  setMemberColor(roomId, userId, colorId);
  emitRoomUpdate(roomId);
  if (room.gameId) emitGameUpdate(room.gameId);
  return { ok: true };
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
  // 채팅 잠금(서버 강제) — 밤/지목·투표 중 차단, 귓말은 공개토론 중 양옆 이웃에게만.
  // 로비·종료 게임은 자유. 이야기꾼(방장)은 운영자라 예외.
  if (room.gameId && room.ownerId !== user.id) {
    const g = getGame(room.gameId);
    if (g && g.status !== "finished") {
      const mySeat = seatForUser(room.gameId, user.id);
      const nominationActive = !!getActiveNomination(room.gameId, g.day);
      const gate = chatGate(g.phase, openTimerRunning(g), nominationActive, mySeat, g.players.length);
      if (recipientUserId == null) {
        if (!gate.allChat) return { error: gate.reason };
      } else {
        if (!gate.whisper) return { error: gate.reason || "지금은 귓말할 수 없습니다." };
        const rSeat = seatForUser(room.gameId, recipientUserId);
        if (rSeat == null || !gate.neighborSeats.includes(rSeat))
          return { error: "귓말은 양옆 이웃에게만 가능합니다." };
      }
    }
  }
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
/**
 * ST '보여주기' — seat 좌석 능력의 결과를 resolveShowcase로 계산해 받는 사람 폰에 push(즉시 전달).
 * 무엇을 드러낼지는 lib/showcase 단일 출처(LAN show 페이지와 동일). ST는 행 버튼만 누른다.
 * toSeat: recipient=none(제3자에게 보여주는 화면)일 때 지정. 그 외는 payload가 받는 좌석을 계산.
 */
export async function pushShowcaseAction(
  roomId: string,
  seat: number,
  characterId: string,
  opts: { variant?: number; mode?: string; toSeat?: number } = {},
): Promise<{ error: string } | { id: string }> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  const game = getGame(room.gameId);
  if (!game) return { error: "게임을 찾을 수 없습니다." };
  const map = characterMapForGame(game);
  const payload = resolveShowcase(
    game,
    seat,
    { as: characterId, variant: opts.variant, mode: opts.mode },
    (id) => map.get(id)?.team,
  );
  if (!payload) return { error: "행동 좌석을 찾을 수 없습니다." };
  // 표준 화면이 기록을 요구하는데 없으면(빈 모달 방지) 막는다.
  if (payload.kind === "standard" && !payload.hasRecord && !payload.emptyAllowed)
    return { error: "먼저 행동을 기록한 뒤 보여주세요." };
  const toSeat = opts.toSeat ?? (payload.kind === "standard" ? payload.recipientSeat : null);
  if (toSeat == null) return { error: "받는 좌석을 지정하세요." };
  if (!game.players.some((p) => p.seat === toSeat)) return { error: "받는 좌석이 올바르지 않습니다." };
  const id = createRequest({ gameId: room.gameId, seat: toSeat, kind: "info", info: payload });
  emitGameUpdate(room.gameId);
  return { id };
}

/**
 * ST '고르게 하기' — 플레이어 폰으로 선택 요청. spec으로 요청 종류를 결정한다:
 *   - playerPicks 직업(철학자·도박꾼 등): 직업 선택(pick-character), 좌석까지면 좌석+직업(pick-player-character).
 *   - 그 외 대상 선택 능력(수도사·임프·독살자·점쟁이 등, targets≥1): 좌석만 선택(pick-players).
 * 플레이어 응답은 행에 표시되고, ST가 그 선택으로 행동을 기록한 뒤(정보면) 보여준다.
 */
export async function requestPlayerPickAction(
  roomId: string,
  seat: number,
  characterId: string,
): Promise<{ error: string } | { id: string }> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  const game = getGame(room.gameId);
  if (!game) return { error: "게임을 찾을 수 없습니다." };
  if (!game.players.some((p) => p.seat === seat)) return { error: "좌석이 올바르지 않습니다." };
  const spec = specForPhase(characterId, game.phase ?? "night", game.day);
  let kind: NightRequestKind;
  let prompt: string;
  if (spec.playerPicks) {
    kind = spec.targets > 0 ? "pick-player-character" : "pick-character";
    prompt = spec.hint ? `${spec.hint} 선택` : "직업을 선택하세요";
  } else if (spec.targets > 0) {
    kind = "pick-players";
    prompt = spec.hint ? `${spec.hint} 선택` : `대상 ${Math.max(1, Math.min(3, spec.targets))}명 선택`;
  } else {
    return { error: "플레이어가 고를 대상이 없습니다." };
  }
  const id = createRequest({
    gameId: room.gameId,
    seat,
    kind,
    prompt: prompt.slice(0, 300),
    maxTargets: Math.max(1, Math.min(3, spec.targets || 1)),
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

// ── 낮 지목·투표(시계바늘 순차) ──

/**
 * 지목 생성 공통 — 지명자/피지명자 좌석 검증 + 하루 한도(각 1회) + 활성 지목 1개 제한.
 * 라이브 레이어만 만든다(committed VoteRecord는 정산 시). 투표는 공개라 redaction 없음.
 */
function doOpenNomination(
  gameId: string,
  nominator: number,
  nominee: number,
): { error: string } | { id: string } {
  const game = getGame(gameId);
  if (!game) return { error: "게임을 찾을 수 없습니다." };
  if (game.status === "finished") return { error: "종료된 게임입니다." };
  if (game.phase !== "day") return { error: "낮에만 지목할 수 있습니다." };
  if (nominator === nominee) return { error: "자기 자신은 지목할 수 없습니다." };
  const by = game.players.find((p) => p.seat === nominator);
  const target = game.players.find((p) => p.seat === nominee);
  if (!by || !target) return { error: "좌석을 찾을 수 없습니다." };
  if (by.status !== "alive") return { error: "죽은 플레이어는 지목할 수 없습니다." };
  if (getActiveNomination(gameId, game.day)) return { error: "이미 진행 중인 지목이 있습니다." };
  const today = listForDay(gameId, game.day);
  if (today.some((n) => n.nominator === nominator)) return { error: "이미 지목했습니다(하루 1회)." };
  if (today.some((n) => n.nominee === nominee)) return { error: "이미 지목된 대상입니다(하루 1회)." };
  cancelStale(gameId, game.day); // 지난 낮의 미커밋 지목 정리
  const id = openNomination({
    gameId,
    day: game.day,
    nominator,
    nominee,
    seats: game.players.map((p) => ({ seat: p.seat, status: p.status, ghostVoteUsed: p.ghostVoteUsed })),
  });
  emitGameUpdate(gameId);
  return { id };
}

/** 플레이어 지목 — 본인이 지명자. 하루 1회·생존자만(서버 강제). */
export async function nominateAction(
  roomId: string,
  nomineeSeat: number,
): Promise<{ error: string } | { id: string }> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  // 플레이어 직접 지목은 ST가 '지목 받기'를 연 뒤에만(대행은 아래 openNominationOnBehalf로 예외).
  if (!getGame(room.gameId)?.nominationsOpen)
    return { error: "아직 지목 시간이 아닙니다. 이야기꾼이 지목을 열면 지목할 수 있습니다." };
  const seat = seatForUser(room.gameId, user.id);
  if (seat == null) return { error: "좌석이 배정되지 않았습니다(관전자는 지목 불가)." };
  return doOpenNomination(room.gameId, seat, nomineeSeat);
}

/** ST 대행 지목 — 지명자·피지명자 좌석을 직접 지정. */
export async function openNominationOnBehalfAction(
  roomId: string,
  nominator: number,
  nominee: number,
): Promise<{ error: string } | { id: string }> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  return doOpenNomination(room.gameId, nominator, nominee);
}

/** ST: '지목 받기' 활성화/중지 — 열려야 플레이어가 직접 지목할 수 있다(순차로 여러 번 허용). */
export async function setNominationsOpenAction(
  roomId: string,
  open: boolean,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  setNominationsOpen(room.gameId, open);
  emitGameUpdate(room.gameId);
}

/** ST: 낮 타이머(주장·반론) 시작 — 초 지정 시 길이 설정 후 시작. 지목 콘솔에서 수동. */
export async function startDayTimerAction(
  roomId: string,
  kind: TimerKind,
  sec?: number,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  if (sec != null && sec > 0) setTimerDuration(room.gameId, kind, Math.min(600, sec));
  startTimer(room.gameId, kind);
  emitGameUpdate(room.gameId);
}

/** ST: 낮 타이머(주장·반론) 정지. */
export async function stopDayTimerAction(
  roomId: string,
  kind: TimerKind,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  stopTimer(room.gameId, kind);
  emitGameUpdate(room.gameId);
}

/** ST: 투표 스윕 시작(첫 좌석부터). */
export async function startVoteAction(roomId: string, id: string): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  startVote(id);
  if (room.gameId) emitGameUpdate(room.gameId);
}

/** 플레이어: 자기 차례에 손 들기/내리기. pointer 좌석만, 죽었으면 유령표 있을 때만 up. */
export async function castHandAction(
  roomId: string,
  id: string,
  hand: number,
): Promise<{ error: string } | void> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  if (nom.status !== "voting") return { error: "투표 중이 아닙니다." };
  const seat = seatForUser(room.gameId, user.id);
  if (seat == null) return { error: "좌석이 배정되지 않았습니다." };
  if (seat !== nom.order[nom.pointer]) return { error: "당신의 차례가 아닙니다." };
  const me = getGame(room.gameId)?.players.find((p) => p.seat === seat);
  if (!me) return { error: "좌석을 찾을 수 없습니다." };
  const up = hand === 1;
  const isDead = me.status === "dead";
  if (isDead && up && me.ghostVoteUsed) return { error: "유령표를 이미 사용했습니다." };
  setHand(id, seat, up ? 1 : 0, isDead && up);
  emitGameUpdate(room.gameId);
}

/**
 * 다음 좌석으로. ST는 항상 가능(수동 ▶다음), 비-ST 멤버는 턴 만료 시에만(자동 advance 백업).
 * step CAS로 중복 호출은 무해. tallied면 스윕 종료.
 */
export async function advanceNominationAction(
  roomId: string,
  id: string,
  expectedStep: number,
): Promise<{ error: string } | { result: string }> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  const isOwner = room.ownerId === user.id || isAdmin(user);
  if (!isOwner) {
    // 자동 advance 백업: 좌석 타이머가 실제로 만료됐을 때만 허용.
    if (nom.perSeatSec <= 0 || nom.paused || !nom.turnStartedAt) return { error: "권한이 없습니다." };
    if (Date.now() - Date.parse(nom.turnStartedAt) < nom.perSeatSec * 1000)
      return { error: "아직 시간이 남았습니다." };
  }
  const result = advance(id, expectedStep);
  emitGameUpdate(room.gameId);
  return { result };
}

/** ST: 일시정지/재개/속도/취소. */
export async function pauseNominationAction(roomId: string, id: string): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  pauseNomination(id);
  if (room.gameId) emitGameUpdate(room.gameId);
}

export async function resumeNominationAction(roomId: string, id: string): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  resumeNomination(id);
  if (room.gameId) emitGameUpdate(room.gameId);
}

export async function setNominationPaceAction(
  roomId: string,
  id: string,
  perSeatSec: number,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  setPace(id, perSeatSec);
  if (room.gameId) emitGameUpdate(room.gameId);
}

export async function cancelNominationAction(roomId: string, id: string): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  cancelNomination(id);
  if (room.gameId) emitGameUpdate(room.gameId);
}

/**
 * ST 정산 — 라이브 찬성표를 기존 VoteRecord로 확정한다(복기·언더테이커·식인귀는 이 committed만 봄).
 * executed면 좌석 처형. captureUndo로 되돌리기 지원(LAN recordVoteAction과 동일 경로).
 */
export async function commitNominationAction(
  roomId: string,
  id: string,
  executed: boolean,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  const votes = countUp(id);
  captureUndo(room.gameId, "낮 투표 정산");
  recordVote(room.gameId, { nominator: nom.nominator, nominee: nom.nominee, votes, executed });
  if (executed) setStatus(room.gameId, nom.nominee, "dead", "execution");
  markCommitted(id);
  emitGameUpdate(room.gameId);
}

/** 활성 지목 조회 — 플레이어·ST 공용(멤버면 누구나, 공개 정보). 낮이 아니면 null. */
export async function getActiveNominationAction(roomId: string): Promise<Nomination | null> {
  const { room } = await requireRoomMember(roomId);
  if (!room.gameId) return null;
  const game = getGame(room.gameId);
  if (!game || game.phase !== "day") return null;
  return getActiveNomination(room.gameId, game.day) ?? null;
}
