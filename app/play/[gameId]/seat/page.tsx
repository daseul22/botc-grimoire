import { notFound, redirect } from "next/navigation";
import { getGame } from "@/lib/games";
import { getRoomByGameId } from "@/lib/rooms";
import { characterMapForGame } from "@/lib/game-characters";
import { SeatView } from "@/components/SeatView";

export const dynamic = "force-dynamic";

export const metadata = { title: "내 자리" };

// LAN(현장) 게스트 전용 좌석 뷰 — 같은 WiFi 신뢰 기반(직접 자리 선택).
// 온라인(룸) 게임은 보안 적용된 /rooms/[roomId]/seat로 보낸다(좌석 바인딩 + redaction).
export default async function SeatPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = getGame(gameId);
  if (!game) notFound();

  const room = getRoomByGameId(gameId);
  if (room) redirect(`/rooms/${room.id}/seat`);

  return <SeatView game={game} sheetChars={[...characterMapForGame(game).values()]} />;
}
