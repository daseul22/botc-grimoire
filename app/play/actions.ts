"use server";

import os from "node:os";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getCharacter } from "@/lib/data";
import {
  advancePhase,
  captureUndo,
  claimSeat,
  clearAction,
  clearUndo,
  cloneGame,
  createGame,
  deleteGame,
  finishGame,
  getClaims,
  getGame,
  getGameConfig,
  clearVote,
  prevPhase,
  commitActionRecord,
  recordVote,
  redrawRoles,
  releaseSeat,
  renameGame,
  savePositions,
  setBluffs,
  setGhostVote,
  setHerring,
  setLock,
  setAlignment,
  setDisguise,
  setLunaticBluffs,
  setLunaticMinions,
  setTimerDuration,
  startTimer,
  stopTimer,
  clearTimer,
  setMemo,
  setNickname,
  swapSeats,
  toggleGlobalMarker,
  setNote,
  setRoles,
  setStatus,
  toggleDone,
  toggleMarker,
  undoLast,
  getGameOwner,
} from "@/lib/games";
import { getCurrentUser, isAdmin, isStoryteller, userIdByNickname, type AuthUser } from "@/lib/auth";
import { emitGameUpdate, emitRoomUpdate, clearRoomChannel } from "@/lib/realtime";
import { closeRoom, getRoomByGameId } from "@/lib/rooms";
import { assignRoles, resolveSheet } from "@/lib/role-assign";
import { isOncePerGame } from "@/lib/night-actions";
import { alignmentOf, ratioTotal, type Ratio } from "@/lib/ratio";
import { circlePositions } from "@/lib/seat-layout";
import type { DeathCause, Game, SeatStatus } from "@/lib/types";

// 직업 배정·시트 해석은 공용 모듈로 분리(룸 시작과 공유). → lib/role-assign.ts

/**
 * 게임 조작(진행/복제/삭제/이름변경 등) 권한: 게임을 시작한 이야기꾼 본인 또는 관리자.
 * 서버 액션은 공개 POST 엔드포인트이므로 UI 게이팅과 별개로 여기서 반드시 검증한다.
 * 미인가 시 throw. 플레이어 폰의 자리 점유(claimSeat)는 이 가드를 거치지 않는다.
 */
async function requireGameManager(gameId: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  if (isAdmin(user)) return user;
  const owner = getGameOwner(gameId);
  if (owner == null || owner !== user.id)
    throw new Error("이 게임을 조작할 권한이 없습니다.");
  return user;
}

/**
 * 변경 신호를 실시간 버스로 쏘고 갱신된 Game을 반환한다.
 * 거의 모든 mutating 액션이 `return getGame(gameId)!` 대신 이걸 써서,
 * 커밋 직후 연결된 클라(플레이어 폰 등)가 즉시 갱신되도록 한다.
 * (DB 쓰기는 이 호출 전에 동기적으로 커밋됨 → 클라가 refetch하면 최신 상태를 본다.)
 */
function touch(gameId: string): Game {
  emitGameUpdate(gameId);
  return getGame(gameId)!;
}

export async function startGameAction(input: {
  sheetId: string;
  excludedIds: string[];
  counts: Ratio;
  nicknames: string[];
}): Promise<{ error: string } | void> {
  // 게임 시작 = 이야기꾼·관리자만. 시작한 사람이 이 게임의 소유자(이야기꾼)가 된다.
  const user = await getCurrentUser();
  if (!user || !isStoryteller(user))
    return { error: "게임 시작은 이야기꾼 또는 관리자만 가능합니다." };

  const sheet = resolveSheet(input.sheetId);
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };

  // 닉네임 미입력 시 "플레이어 N" 기본값
  const nicknames = input.nicknames.map((n, i) => n.trim() || `플레이어 ${i + 1}`);
  if (ratioTotal(input.counts) !== nicknames.length)
    return { error: "직업군 비율 합이 플레이어 수와 다릅니다." };

  const res = assignRoles(sheet, input.excludedIds, input.counts);
  if ("error" in res) return res;

  const pts = circlePositions(nicknames.length);
  const players = res.roles.map((r) => ({
    seat: r.seat,
    nickname: nicknames[r.seat],
    characterId: r.characterId,
    alignment: r.alignment as "good" | "evil",
    x: pts[r.seat].x,
    y: pts[r.seat].y,
    // 닉네임이 가입 계정과 일치하면 그 계정에 바인딩(통계가 계정을 따라가도록). 게스트면 null.
    userId: userIdByNickname(nicknames[r.seat]),
  }));

  const id = createGame({
    sheetId: input.sheetId,
    sheetName: sheet.name.ko,
    config: { excludedIds: input.excludedIds, counts: input.counts },
    players,
    ownerId: user.id,
  });
  redirect(`/play/${id}`);
}

export async function redrawAction(gameId: string): Promise<Game | { error: string }> {
  await requireGameManager(gameId);
  const cfg = getGameConfig(gameId);
  const game = getGame(gameId);
  if (!cfg || !game) return { error: "게임을 찾을 수 없습니다." };
  const sheet = resolveSheet(cfg.sheetId);
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };

  // 저장된 config가 비어 있어도(구버전 게임) 안전하도록, 현재 배정된
  // 플레이어들의 팀 구성에서 비율을 그대로 도출해 재추첨한다.
  const counts: Ratio = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const p of game.players) {
    const team = getCharacter(p.characterId)?.team;
    if (team && team in counts) counts[team as keyof Ratio]++;
  }

  const res = assignRoles(sheet, cfg.excludedIds, counts);
  if ("error" in res) return res;
  // 재추첨은 사실상 게임 리셋 — 이전 진행 스냅샷이 undo로 되살아나지 않도록 스택을 비우고,
  // 재추첨 자체만 1스텝 되돌릴 수 있게 직전 상태를 캡처한다.
  clearUndo(gameId);
  captureUndo(gameId, "재추첨");
  redrawRoles(gameId, res.roles);
  return touch(gameId);
}

export async function advancePhaseAction(gameId: string): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "페이즈 전환");
  advancePhase(gameId);
  return touch(gameId);
}

export async function prevPhaseAction(gameId: string): Promise<Game> {
  await requireGameManager(gameId);
  prevPhase(gameId);
  return touch(gameId);
}

export async function setStatusAction(
  gameId: string,
  seat: number,
  status: SeatStatus,
  cause: DeathCause = "",
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "생사 변경");
  setStatus(gameId, seat, status, cause);
  return touch(gameId);
}

export async function recordVoteAction(
  gameId: string,
  nominator: number,
  nominee: number,
  votes: number,
  executed: boolean,
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "투표 기록");
  recordVote(gameId, { nominator, nominee, votes, executed });
  // 처형 체크 시 캔버스에서도 자동 사망 처리(원인=처형). 되돌리려면 좌석에서 수동 부활.
  if (executed) setStatus(gameId, nominee, "dead", "execution");
  return touch(gameId);
}

export async function clearVoteAction(gameId: string, nominee: number): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "투표 삭제");
  clearVote(gameId, nominee);
  return touch(gameId);
}

export async function toggleGhostVoteAction(
  gameId: string,
  seat: number,
  used: boolean,
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "유령표");
  setGhostVote(gameId, seat, used);
  return touch(gameId);
}

export async function toggleDoneAction(gameId: string, seat: number): Promise<Game> {
  await requireGameManager(gameId);
  toggleDone(gameId, seat);
  return touch(gameId);
}

export async function setNoteAction(gameId: string, note: string): Promise<Game> {
  await requireGameManager(gameId);
  setNote(gameId, note);
  return touch(gameId);
}

export async function toggleMarkerAction(
  gameId: string,
  seat: number,
  markerId: string,
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "마커 변경");
  toggleMarker(gameId, seat, markerId);
  return touch(gameId);
}

/** 레드헤링 지정/이동/해제 — seat=null이면 해제. 게임 전체에 한 명만 유지(setHerring이 보장). */
export async function setHerringAction(gameId: string, seat: number | null): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "레드헤링 지정");
  setHerring(gameId, seat);
  return touch(gameId);
}

export async function recordActionAction(
  gameId: string,
  actorSeat: number,
  characterId: string,
  targets: number[],
  result: string,
  bluff = false,
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "행동 기록");
  // 기록 + 부수효과(철학자 gained/drunk · 일회성 noability · 처리완료 ✓)는 온라인과 단일 출처.
  commitActionRecord(gameId, { actorSeat, characterId, targets, result, bluff });
  return touch(gameId);
}

export async function clearActionAction(
  gameId: string,
  actorSeat: number,
  characterId = "",
  bluff = false,
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "행동 삭제");
  // 일회성 능력 기록을 지우면 자동 부여했던 '능력 없음' 마커도 회수(잘못 기록 되돌리기).
  if (!bluff) {
    const g0 = getGame(gameId);
    const cid = characterId || g0?.actions.find((a) => a.actorSeat === actorSeat && !a.bluff)?.characterId || "";
    if (isOncePerGame(cid)) {
      const actor = g0?.players.find((p) => p.seat === actorSeat);
      // 해당 직업의 noability 마커만 정확히 회수(같은 좌석 다른 일회성 능력 마커는 보존). 구버전 bare도 처리.
      const existing = actor?.markers.find((m) => m === `noability:${cid}` || m === "noability");
      if (existing) toggleMarker(gameId, actorSeat, existing);
    }
  }
  clearAction(gameId, actorSeat, characterId, bluff);
  return touch(gameId);
}

export async function setBluffsAction(
  gameId: string,
  ids: string[],
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "블러핑 변경");
  setBluffs(gameId, ids);
  return touch(gameId);
}

export async function toggleLockAction(
  gameId: string,
  seat: number,
  locked: boolean,
): Promise<Game> {
  await requireGameManager(gameId);
  setLock(gameId, seat, locked);
  return touch(gameId);
}

export async function setMemoAction(
  gameId: string,
  seat: number,
  memo: string,
): Promise<Game> {
  await requireGameManager(gameId);
  setMemo(gameId, seat, memo);
  return touch(gameId);
}

export async function setAlignmentAction(
  gameId: string,
  seat: number,
  alignment: "good" | "evil",
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "진영 변경");
  setAlignment(gameId, seat, alignment);
  return touch(gameId);
}

export async function setNicknameAction(
  gameId: string,
  seat: number,
  nickname: string,
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "닉네임 변경");
  // 새 닉네임이 가입 계정과 일치하면 그 계정에 바인딩, 게스트면 해제(null).
  setNickname(gameId, seat, nickname, userIdByNickname(nickname));
  return touch(gameId);
}

export async function swapSeatsAction(
  gameId: string,
  a: number,
  b: number,
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "자리 교환");
  swapSeats(gameId, a, b);
  return touch(gameId);
}

export async function toggleGlobalMarkerAction(
  gameId: string,
  marker: string,
): Promise<Game> {
  await requireGameManager(gameId);
  captureUndo(gameId, "전역 마커");
  toggleGlobalMarker(gameId, marker);
  return touch(gameId);
}

export async function setLunaticBluffsAction(gameId: string, ids: string[]): Promise<Game> {
  await requireGameManager(gameId);
  setLunaticBluffs(gameId, ids);
  return touch(gameId);
}

export async function setLunaticMinionsAction(gameId: string, seats: number[]): Promise<Game> {
  await requireGameManager(gameId);
  setLunaticMinions(gameId, seats);
  return touch(gameId);
}

export async function setTimerDurationAction(
  gameId: string,
  kind: "whisper" | "open",
  durationSec: number,
): Promise<Game> {
  await requireGameManager(gameId);
  setTimerDuration(gameId, kind, durationSec);
  return touch(gameId);
}

export async function startTimerAction(gameId: string, kind: "whisper" | "open"): Promise<Game> {
  await requireGameManager(gameId);
  startTimer(gameId, kind);
  return touch(gameId);
}

export async function stopTimerAction(gameId: string, kind: "whisper" | "open"): Promise<Game> {
  await requireGameManager(gameId);
  stopTimer(gameId, kind);
  return touch(gameId);
}

export async function clearTimerAction(gameId: string, kind: "whisper" | "open"): Promise<Game> {
  await requireGameManager(gameId);
  clearTimer(gameId, kind);
  return touch(gameId);
}

export async function setDisguiseAction(
  gameId: string,
  seat: number,
  characterId: string,
): Promise<Game> {
  await requireGameManager(gameId);
  setDisguise(gameId, seat, characterId);
  // 위장 직업으로 지정된 직업이 악마 블러핑에 들어가 있으면 제거(가짜직업은 인플레이처럼 취급).
  if (characterId) {
    const g = getGame(gameId);
    if (g?.bluffs.includes(characterId)) {
      setBluffs(gameId, g.bluffs.filter((b) => b !== characterId));
    }
  }
  return touch(gameId);
}

/**
 * 직업 수동 변경 (1일차 밤). 다른 좌석이 그 직업을 이미 가졌으면 서로 교체.
 */
export async function setRoleAction(
  gameId: string,
  seat: number,
  characterId: string,
): Promise<Game | { error: string }> {
  await requireGameManager(gameId);
  const game = getGame(gameId);
  if (!game) return { error: "게임을 찾을 수 없습니다." };
  const ch = getCharacter(characterId);
  if (!ch) return { error: "직업을 찾을 수 없습니다." };
  const me = game.players.find((p) => p.seat === seat);
  if (!me) return { error: "플레이어를 찾을 수 없습니다." };
  if (me.characterId === characterId) return game;

  captureUndo(gameId, "직업 변경");
  const newAlign = alignmentOf(ch.team);
  const other = game.players.find(
    (p) => p.seat !== seat && p.characterId === characterId,
  );
  if (other) {
    // 교체: 상대는 내 직업/진영을 가져간다
    setRoles(gameId, [
      { seat, characterId, alignment: newAlign },
      { seat: other.seat, characterId: me.characterId, alignment: me.alignment },
    ]);
  } else {
    setRoles(gameId, [{ seat, characterId, alignment: newAlign }]);
  }
  return touch(gameId);
}

export async function finishGameAction(
  gameId: string,
  result: "good" | "evil",
): Promise<void> {
  await requireGameManager(gameId);
  captureUndo(gameId, "게임 종료");
  finishGame(gameId, result);
  emitGameUpdate(gameId); // 종료를 플레이어 화면에도 즉시 반영
  revalidatePath(`/play/${gameId}`);
  redirect(`/play/${gameId}`);
}

export async function savePositionsAction(
  gameId: string,
  positions: { seat: number; x: number; y: number }[],
): Promise<void> {
  await requireGameManager(gameId);
  savePositions(gameId, positions);
  emitGameUpdate(gameId); // 좌석 배치 변경 → 플레이어 보드(추후)도 같은 좌표로 갱신
}

export async function deleteGameAction(gameId: string): Promise<void> {
  await requireGameManager(gameId);
  // 온라인 게임이면 연결된 룸이 고아가 되지 않게 함께 닫는다(멤버가 죽은 룸에 갇히는 것 방지).
  const room = getRoomByGameId(gameId);
  deleteGame(gameId);
  emitGameUpdate(gameId); // 열려 있던 뷰가 새로고침되며 사라진 게임을 인지
  if (room) {
    closeRoom(room.id);
    emitRoomUpdate(room.id);
    clearRoomChannel(room.id);
  }
  revalidatePath("/games");
}

/** 게임 복제 — 같은 셋업(좌석·닉네임·직업·배치)으로 새 1일차 밤 게임을 만들고 진행 화면으로 이동. */
export async function cloneGameAction(srcId: string): Promise<void> {
  // 본인이 만든(또는 관리자) 게임만 복제 가능. 새 게임의 소유자는 복제한 사람.
  const user = await requireGameManager(srcId);
  const id = cloneGame(srcId, user.id);
  revalidatePath("/games");
  redirect(`/play/${id}`);
}

/** 게임 표시 이름 변경(내역 구분용). 빈 문자열이면 sheetName으로 폴백 표시. */
export async function renameGameAction(
  gameId: string,
  label: string,
): Promise<void> {
  await requireGameManager(gameId);
  renameGame(gameId, label);
  emitGameUpdate(gameId);
  revalidatePath("/games");
  revalidatePath(`/play/${gameId}`);
}

/** 실행 취소 — 가장 최근 조작 직전 상태로 복원. */
export async function undoAction(gameId: string): Promise<Game | { error: string }> {
  await requireGameManager(gameId);
  const label = undoLast(gameId);
  if (label === null) return { error: "되돌릴 조작이 없습니다." };
  revalidatePath(`/play/${gameId}`);
  return touch(gameId);
}

/** 한 좌석의 직업배포 점유 해제 — 만료된 플레이어가 다시 볼 수 있게 ST가 허용. */
export async function releaseSeatAction(gameId: string, seat: number): Promise<Game> {
  await requireGameManager(gameId);
  releaseSeat(gameId, seat);
  return touch(gameId);
}

// 폰 공유용 LAN 주소를 만든다. 서버의 LAN IPv4를 골라 :3000 + path로 조립.
// 같은 WiFi 폰에서 열 수 있도록 사설 대역(192.168 > 10 > 172.16-31)을 우선한다.
export async function lanUrlAction(
  path: string,
): Promise<{ url: string } | { error: string }> {
  // 폰 공유 링크 생성은 이야기꾼·관리자 도구.
  const user = await getCurrentUser();
  if (!user || !isStoryteller(user)) return { error: "권한이 없습니다." };
  const addrs: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      const isV4 = ni.family === "IPv4" || (ni.family as unknown) === 4;
      if (isV4 && !ni.internal) addrs.push(ni.address);
    }
  }
  const rank = (ip: string) =>
    ip.startsWith("192.168.") ? 0
    : ip.startsWith("10.") ? 1
    : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2
    : 3;
  const host = addrs.sort((a, b) => rank(a) - rank(b))[0];
  if (!host) return { error: "LAN IP를 찾지 못했습니다. 같은 WiFi에 연결됐는지 확인하세요." };
  return { url: `http://${host}:3000${path}` };
}

// 직업 배포 링크에서 플레이어가 자기 좌석을 점유. form action(무JS 동작).
// seat은 bind로 받는다(hidden input 직렬화 의존 X). 좌석은 서버에서 1회만 점유되고,
// 점유자는 쿠키로 식별해 다른 사람이 못 엿본다.
export async function claimSeatAction(
  gameId: string,
  seat: number,
  _formData?: FormData,
): Promise<void> {
  const path = `/play/${gameId}/claim`;
  if (Number.isFinite(seat)) {
    const jar = await cookies();
    const key = `botc-claim-${gameId}`;
    // 쿠키가 내 좌석이어도 점유 기록이 해제됐을 수 있다(ST의 재열람 허용).
    // claims에 좌석이 없으면 다시 점유해야 30초 카운트가 새로 시작된다.
    const mine = jar.get(key)?.value === String(seat);
    const claimedNow = seat in getClaims(gameId);
    if (!mine || !claimedNow) {
      const r = claimSeat(gameId, seat);
      if (r.ok) {
        // path는 '/' — proxy.ts가 모든 경로 요청에서 이 쿠키를 봐야 가두기가 동작.
        jar.set(key, String(seat), {
          path: "/",
          maxAge: 60 * 60 * 12,
          httpOnly: true,
          sameSite: "lax",
        });
        emitGameUpdate(gameId); // 좌석 점유를 이야기꾼 보드(추후)에 즉시 반영
      }
    }
  }
  // PRG: 쿠키 set 후 redirect → 브라우저가 새 쿠키로 GET하므로 같은 응답 내 stale-cookie 문제 회피.
  redirect(path);
}
