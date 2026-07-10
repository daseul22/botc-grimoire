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
import { PlayerGame } from "@/components/PlayerGame";

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

  const boundSeat = seatForUser(room.gameId, user.id);
  if (boundSeat == null) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="mb-1 text-xs text-muted">{game.sheetName}</p>
        <p className="text-sm text-muted">관전자에게는 자리 정보가 없습니다.</p>
      </div>
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
    const today = listForDay(room.gameId, game.day);
    nominatedSeats = today.map((n) => n.nominee);
    const meP = game.players.find((p) => p.seat === boundSeat);
    const iNominated = today.some((n) => n.nominator === boundSeat);
    // ST가 '지목 받기'를 연 뒤에만 직접 지목 가능(순차로 여러 번 — 활성 지목 없을 때).
    canNominate = game.nominationsOpen && !nomination && !!meP && meP.status === "alive" && !iNominated;
  }

  // 채팅 잠금 정책(밤/지목·투표 중 차단, 귓말=공개토론 중 양옆 이웃) — 서버 sendChatAction과 동일 기준.
  const gate = chatGate(game.phase, openTimerRunning(game), !!nomination, boundSeat, game.players.length);
  const neighborUserIds = room.members
    .filter((m) => m.seat != null && gate.neighborSeats.includes(m.seat as number))
    .map((m) => m.userId);
  const chatPolicy: ChatPolicy = {
    allChat: gate.allChat,
    whisper: gate.whisper ? neighborUserIds : [],
    reason: gate.reason,
  };

  // 닉네임 구분 색: 채팅용 userId→색id, 보드 라벨용 seat→hex.
  const memberColors = Object.fromEntries(room.members.map((m) => [m.userId, m.color]));
  const seatColors = Object.fromEntries(
    room.members
      .filter((m) => m.seat != null)
      .map((m) => [m.seat as number, colorHex(m.color, m.userId)]),
  );

  return (
    <PlayerGame
      game={redacted}
      sheetChars={sheetChars}
      boundSeat={boundSeat}
      gameId={room.gameId}
      roomId={roomId}
      meId={user.id}
      members={room.members.map((m) => ({ userId: m.userId, nickname: m.nickname }))}
      memberColors={memberColors}
      seatColors={seatColors}
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
