import { notFound, redirect } from "next/navigation";
import { getGame, getGameOwner, getHistory, listKnownNicknames } from "@/lib/games";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getRoom } from "@/lib/rooms";
import { characterMapForGame } from "@/lib/game-characters";
import { PlayCanvas } from "@/components/PlayCanvas";
import { GameReplay } from "@/components/GameReplay";
import { ChatWidget } from "@/components/ChatWidget";
import { NightConsole } from "@/components/NightConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "온라인 진행" };

// 온라인 게임의 이야기꾼 보드 — 기존 진행(/play/[gameId])과 별도 라우트, 컴포넌트만 재사용.
export default async function RoomPlayPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const room = getRoom(roomId);
  if (!room) notFound();
  if (room.status !== "started" || !room.gameId) redirect(`/rooms/${roomId}`);

  const game = getGame(room.gameId);
  if (!game) redirect(`/rooms/${roomId}`);

  const sheetChars = [...characterMapForGame(game).values()];

  // 종료된 온라인 게임의 복기는 누구나 열람 가능(기존 정책과 동일).
  if (game.status === "finished") {
    return <GameReplay game={game} history={getHistory(room.gameId)} sheetChars={sheetChars} />;
  }

  // 진행 중 보드는 방장(이야기꾼) 본인 또는 관리자만.
  const user = await getCurrentUser();
  const owner = getGameOwner(room.gameId);
  const canManage = !!user && (isAdmin(user) || (owner != null && owner === user.id));
  if (!canManage) redirect(user ? `/rooms/${roomId}/seat` : "/login");

  return (
    <>
      <PlayCanvas
        game={game}
        sheetChars={sheetChars}
        knownNicknames={listKnownNicknames().map((k) => k.nickname)}
      />
      <NightConsole game={game} sheetChars={sheetChars} roomId={roomId} />
      <ChatWidget
        roomId={roomId}
        meId={user.id}
        members={room.members.map((m) => ({ userId: m.userId, nickname: m.nickname }))}
      />
    </>
  );
}
