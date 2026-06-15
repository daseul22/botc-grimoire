import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { characterMapForGame } from "@/lib/game-characters";
import { SeatView } from "@/components/SeatView";

export const dynamic = "force-dynamic";

export const metadata = { title: "내 자리" };

export default async function SeatPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = getGame(gameId);
  if (!game) notFound();

  return <SeatView game={game} sheetChars={[...characterMapForGame(game).values()]} />;
}
