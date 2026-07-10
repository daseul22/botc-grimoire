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
  commitActionRecord,
  createGame,
  getGame,
  getGameOwner,
  recordVote,
  seatForUser,
  setNominationsOpen,
  setStatus,
  setTimerDuration,
  startTimer,
  stopTimer,
  toggleMarker,
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
  setHidden as setNominationHidden,
  setPace,
  startVote,
  type Nomination,
} from "@/lib/nominations";
import {
  acknowledge,
  cancelRequest,
  complete,
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
import { markerForAction, showcaseVariants, specForPhase } from "@/lib/night-actions";
import type { Game } from "@/lib/types";
import { assignRoles, resolveSheet } from "@/lib/role-assign";
import { circlePositions } from "@/lib/seat-layout";
import { ratioTotal, type Ratio } from "@/lib/ratio";
import { emitRoomUpdate, emitGameUpdate, clearRoomChannel } from "@/lib/realtime";
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
  readPresence,
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
  if (room.ownerId === user.id) {
    closeRoom(roomId);
    emitRoomUpdate(roomId);
    clearRoomChannel(roomId);
  } else {
    removeMember(roomId, user.id);
    emitRoomUpdate(roomId);
  }
  redirect("/rooms");
}

export async function closeRoomAction(roomId: string): Promise<{ error: string } | void> {
  await requireRoomOwner(roomId);
  closeRoom(roomId);
  emitRoomUpdate(roomId);
  clearRoomChannel(roomId);
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

/** 접속 생존 신호(빈번하므로 emit 안 함). 로비·게임 화면에서 주기적으로 호출. */
export async function heartbeatRoomAction(roomId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  touchMember(roomId, user.id);
}

/**
 * 좌석별 접속 여부(seat → online). ST 보드가 폴링해 오프라인 좌석을 표시한다.
 * 프레즌스는 비밀이 아니라 게임 SSE로 흘리지 않고(하트비트는 emit 안 함) 별도 조회로 내린다. 멤버만.
 */
export async function getPresenceAction(roomId: string): Promise<Record<number, boolean>> {
  const user = await getCurrentUser();
  if (!user) return {};
  const room = getRoom(roomId);
  if (!room || !room.members.some((m) => m.userId === user.id)) return {};
  const map: Record<number, boolean> = {};
  for (const p of readPresence(roomId)) if (p.seat != null) map[p.seat] = p.online;
  return map;
}

/**
 * ST 보드 전체 게임 refetch — SSE 신호에 서버 진실을 다시 읽어 처형 사망 등 플레이어발 변경을 반영한다.
 * 전체 게임(비밀 포함)이라 **방장(ST)·관리자만**. 플레이어는 자기 좌석 페이지의 redact 경로로만 받는다.
 */
export async function getGameAction(roomId: string): Promise<Game | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const room = getRoom(roomId);
  if (!room || !room.gameId) return null;
  const owner = getGameOwner(room.gameId);
  const canManage = isAdmin(user) || (owner != null && owner === user.id);
  if (!canManage) return null;
  return getGame(room.gameId) ?? null;
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
  // 채팅 잠금(서버 강제) — 밤/지목 시간 차단, 귓말은 공개토론 중 양옆 이웃에게만.
  // 로비·종료 게임은 자유. 이야기꾼(방장)은 운영자라 예외.
  if (room.gameId && room.ownerId !== user.id) {
    const g = getGame(room.gameId);
    if (g && g.status !== "finished") {
      const mySeat = seatForUser(room.gameId, user.id);
      // 관전자(좌석 없는 멤버)는 대화를 볼 수만 있다 — 게임에 개입하지 않도록 전송 차단.
      if (mySeat == null) return { error: "관전자는 대화를 볼 수만 있습니다." };
      // 지목 시간 활성화(nominationsOpen) 또는 활성 지목/투표 중이면 전챗·귓말 모두 차단.
      const nominationsActive = g.nominationsOpen || !!getActiveNomination(room.gameId, g.day);
      const gate = chatGate(g.phase, openTimerRunning(g), nominationsActive, mySeat, g.players.length);
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
  // 받는 좌석 라우팅: standard·grimoire는 payload가 recipientSeat를 계산해 담는다(그 외 특수 모드는 toSeat 명시).
  const routedSeat =
    payload.kind === "standard" || payload.kind === "grimoire" ? payload.recipientSeat : null;
  const toSeat = opts.toSeat ?? routedSeat;
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

/**
 * ST '이 선택으로 기록' — 플레이어가 응답한 선택(좌석/직업)을 밤 행동으로 확정한다. 한 번에:
 *   1) 행동 기록(+철학자·일회성·완료 부수효과, LAN과 단일 출처 commitActionRecord)
 *   2) 상태 마커 즉시 적용(수도사 보호·독·집착 등 — game_phases.state는 단일 JSON이라 서버에서 원자적으로)
 *   3) 보여줄 정보가 없는 능력이면 요청 완료(플레이어 '대기 중' 해제). 정보 직업은 ST가 '보여주기'로 마무리.
 * characterId는 행이 다루는 직업(가짜/획득 포함) — 요청엔 저장 안 하므로 클라가 넘긴다.
 */
export async function commitPickResponseAction(
  roomId: string,
  requestId: string,
  characterId: string,
): Promise<Game | { error: string }> {
  const { room } = await requireRoomOwner(roomId);
  if (!room.gameId) return { error: "게임이 시작되지 않았습니다." };
  const req = getRequest(requestId);
  if (!req || req.gameId !== room.gameId) return { error: "요청을 찾을 수 없습니다." };
  if (req.status !== "responded") return { error: "응답 대기 중인 요청이 아닙니다." };
  const game = getGame(room.gameId);
  if (!game) return { error: "게임을 찾을 수 없습니다." };
  const spec = specForPhase(characterId, game.phase ?? "night", game.day);
  captureUndo(room.gameId, "밤 응답 기록");
  // 1) 행동 기록(+부수효과).
  commitActionRecord(room.gameId, {
    actorSeat: req.seat,
    characterId,
    targets: req.playerTargets,
    result: req.playerChoice,
  });
  // 2) 상태 마커 즉시 적용(add-only — 이미 있으면 skip). 대상 좌석에.
  if (spec.marker && req.playerTargets.length > 0) {
    const markerStr = markerForAction(spec.marker, req.playerChoice);
    for (const s of req.playerTargets) {
      const cur = getGame(room.gameId)?.players.find((p) => p.seat === s);
      if (cur && !cur.markers.includes(markerStr)) toggleMarker(room.gameId, s, markerStr);
    }
  }
  // 3) 보여줄 정보(showcase)가 없으면 요청 완료 → 플레이어 대기 해제. 있으면 이어서 '보여주기'.
  if (showcaseVariants(spec).length === 0) complete(requestId);
  emitGameUpdate(room.gameId);
  return getGame(room.gameId) ?? { error: "게임을 찾을 수 없습니다." };
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
  // 피지명자가 여행자면 '추방'(처형과 다른 규칙: 전원 투표·유령표 무소모·추방선 과반 초과).
  const charMap = characterMapForGame(game);
  const isExile = charMap.get(target.characterId)?.team === "traveller";
  const id = openNomination({
    gameId,
    day: game.day,
    nominator,
    nominee,
    seats: game.players.map((p) => ({ seat: p.seat, status: p.status, ghostVoteUsed: p.ghostVoteUsed })),
    isExile,
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
  // 여행자 추방은 죽은 자도 유령표 소모 없이 투표한다 → 유령표 검사·소모 마킹 모두 건너뛴다.
  if (isDead && up && !nom.isExile && me.ghostVoteUsed) return { error: "유령표를 이미 사용했습니다." };
  setHand(id, seat, up ? 1 : 0, isDead && up && !nom.isExile);
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

/** ST: 비공개 투표(오르간 그라인더) 토글 — 플레이어에게 손·집계를 숨긴다(getActiveNomination이 비-ST에게 hands 비움). */
export async function setNominationHiddenAction(
  roomId: string,
  id: string,
  hidden: boolean,
): Promise<{ error: string } | void> {
  const { room } = await requireRoomOwner(roomId);
  const nom = getNomination(id);
  if (!nom || nom.gameId !== room.gameId) return { error: "지목을 찾을 수 없습니다." };
  setNominationHidden(id, hidden);
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
  // 찬성한 좌석 명단(복기 타임라인용) — 언더테이커·식인귀 검증·사후 분석에 쓴다.
  const voters = nom.hands.filter((h) => h.hand === 1).map((h) => h.seat);
  captureUndo(room.gameId, nom.isExile ? "여행자 추방 정산" : "낮 투표 정산");
  if (nom.isExile) {
    // 추방은 처형(VoteRecord)이 아니다 — 언더테이커·처형 커트라인 오염을 막으려 committed 투표 레이어를
    // 건드리지 않고, 라이브 지목행(is_exile)이 기록으로 남는다. executed=추방 확정이면 여행자 사망(cause='exile').
    if (executed) setStatus(room.gameId, nom.nominee, "dead", "exile");
  } else {
    recordVote(room.gameId, { nominator: nom.nominator, nominee: nom.nominee, votes, executed, voters });
    if (executed) setStatus(room.gameId, nom.nominee, "dead", "execution");
  }
  markCommitted(id);
  emitGameUpdate(room.gameId);
}

/** 활성 지목 조회 — 플레이어·ST 공용(멤버면 누구나, 공개 정보). 낮이 아니면 null. */
export async function getActiveNominationAction(roomId: string): Promise<Nomination | null> {
  const { user, room } = await requireRoomMember(roomId);
  if (!room.gameId) return null;
  const game = getGame(room.gameId);
  if (!game || game.phase !== "day") return null;
  const nom = getActiveNomination(room.gameId, game.day);
  if (!nom) return null;
  // 비공개 투표(오르간 그라인더): 비-ST(플레이어)에겐 손·집계를 서버에서 비운다. 방장·관리자는 전부 본다.
  const isOwner = room.ownerId === user.id || isAdmin(user);
  if (nom.hidden && !isOwner) return { ...nom, hands: [] };
  return nom;
}
