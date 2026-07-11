import { notFound, redirect } from "next/navigation";
import { getGame, seatForUser } from "@/lib/games";
import { getCurrentUser } from "@/lib/auth";
import { getRoom } from "@/lib/rooms";
import { getPlayerNotes } from "@/lib/player-board";
import { getActiveForSeat } from "@/lib/night-requests";
import { getActive as getActiveNomination, listForDay, type Nomination } from "@/lib/nominations";
import { colorHex } from "@/lib/player-colors";
import { chatGate, openTimerRunning, type ChatPolicy } from "@/lib/chat-policy";
import { redactGameForSeat } from "@/lib/redact";
import { characterMapForGame } from "@/lib/game-characters";
import { rules } from "@/lib/data";
import { PlayerGame } from "@/components/PlayerGame";
import { SpectatorGame } from "@/components/SpectatorGame";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 자리" };

// 온라인 플레이어 보드 — 룸 멤버이면서 좌석에 바인딩된 사람만, 자기 좌석 정보만 진짜로 본다.
// 전체 Game을 그대로 넘기지 않고 redactGameForSeat로 비밀을 지워 보낸다(다른 좌석 직업 누출 방지).
export default async function RoomSeatPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const room = getRoom(roomId);
  if (!room) notFound();
  if (!room.members.some((m) => m.userId === user.id)) redirect("/rooms");
  if (room.status !== "started" || !room.gameId) redirect(`/rooms/${roomId}`);

  const game = getGame(room.gameId);
  if (!game) redirect(`/rooms/${roomId}`);

  const memberColorMap = Object.fromEntries(room.members.map((m) => [m.userId, m.color]));
  const seatColorMap = Object.fromEntries(
    room.members
      .filter((m) => m.seat != null)
      .map((m) => [m.seat as number, colorHex(m.color, m.userId)]),
  );

  const boundSeat = seatForUser(room.gameId, user.id);
  if (boundSeat == null) {
    // 관전자(좌석 없는 멤버) — 막다른 페이지 대신 읽기전용 공개 보드. redact(-1)로 전 좌석 마스킹.
    let specNom: Nomination | null = null;
    if (game.phase === "day" && game.status !== "finished") {
      specNom = getActiveNomination(room.gameId, game.day) ?? null;
      if (specNom?.hidden) specNom = { ...specNom, hands: [] };
    }
    return (
      <SpectatorGame
        game={redactGameForSeat(game, -1)}
        nomination={specNom}
        roomId={roomId}
        gameId={room.gameId}
        meId={user.id}
        members={room.members.map((m) => ({ userId: m.userId, nickname: m.nickname }))}
        memberColors={memberColorMap}
        seatColors={seatColorMap}
        chatPolicy={{ allChat: false, whisper: [], reason: "관전 중 — 대화는 볼 수만 있습니다." }}
      />
    );
  }

  // 시트 직업 전체(공개 스크립트 — 추측 picker용)는 원본에서 뽑고, 게임 본문은 내 좌석만 남겨 redact.
  // 좌석↔직업 매핑은 redacted players에서 지워지므로 전체 스크립트 목록을 보내도 비밀이 새지 않는다.
  const sheetChars = [...characterMapForGame(game).values()];
  const redacted = redactGameForSeat(game, boundSeat);
  const notes = getPlayerNotes(room.gameId, user.id);
  const request = getActiveForSeat(room.gameId, boundSeat) ?? null;

  // 낮 지목/투표(공개 정보) — 낮에만. redaction 대상 아님(누가 손 들었는지 전원 공개).
  let nomination: Nomination | null = null;
  let canNominate = false;
  let nominatedSeats: number[] = [];
  if (game.phase === "day" && game.status !== "finished") {
    nomination = getActiveNomination(room.gameId, game.day) ?? null;
    // 비공개 투표(오르간 그라인더): 플레이어 화면(항상 비-ST)에는 손·집계를 숨긴다(getActiveNominationAction과 동일 기준).
    if (nomination?.hidden) nomination = { ...nomination, hands: [] };
    const today = listForDay(room.gameId, game.day);
    nominatedSeats = today.map((n) => n.nominee);
    const meP = game.players.find((p) => p.seat === boundSeat);
    const iNominated = today.some((n) => n.nominator === boundSeat);
    // ST가 '지목 받기'를 연 뒤에만 직접 지목 가능(순차로 여러 번 — 활성 지목 없을 때).
    canNominate = game.nominationsOpen && !nomination && !!meP && meP.status === "alive" && !iNominated;
  }

  // 채팅 잠금 정책(밤/지목 시간 차단, 귓말=공개토론 중 양옆 이웃) — 서버 sendChatAction과 동일 기준.
  // 지목 시간 활성화(nominationsOpen) 또는 활성 지목/투표 중이면 전챗·귓말 모두 차단.
  const gate = chatGate(game.phase, openTimerRunning(game), game.nominationsOpen || !!nomination, boundSeat, game.players.length);
  const neighborUserIds = room.members
    .filter((m) => m.seat != null && gate.neighborSeats.includes(m.seat as number))
    .map((m) => m.userId);
  const chatPolicy: ChatPolicy = {
    allChat: gate.allChat,
    whisper: gate.whisper ? neighborUserIds : [],
    reason: gate.reason,
  };

  // 닉네임 구분 색: 채팅용 userId→색id(memberColorMap), 보드 라벨용 seat→hex(seatColorMap) — 위에서 계산.
  return (
    <PlayerGame
      game={redacted}
      sheetChars={sheetChars}
      rules={rules}
      boundSeat={boundSeat}
      gameId={room.gameId}
      roomId={roomId}
      meId={user.id}
      members={room.members.map((m) => ({ userId: m.userId, nickname: m.nickname }))}
      memberColors={memberColorMap}
      seatColors={seatColorMap}
      initialNotes={notes}
      request={request}
      nomination={nomination}
      canNominate={canNominate}
      nominationsOpen={game.nominationsOpen}
      nominatedSeats={nominatedSeats}
      chatPolicy={chatPolicy}
    />
  );
}
