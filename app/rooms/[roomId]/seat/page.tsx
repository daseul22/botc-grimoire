import { notFound, redirect } from "next/navigation";
import { getGame, seatForUser } from "@/lib/games";
import { getCurrentUser } from "@/lib/auth";
import { getRoom } from "@/lib/rooms";
import { getPlayerNotes } from "@/lib/player-board";
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

  return (
    <PlayerGame
      game={redacted}
      sheetChars={sheetChars}
      boundSeat={boundSeat}
      gameId={room.gameId}
      roomId={roomId}
      meId={user.id}
      initialNotes={notes}
    />
  );
}
