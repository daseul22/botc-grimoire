import { notFound } from "next/navigation";
import { getGame, getHistory } from "@/lib/games";
import { getCharacter } from "@/lib/data";
import { PlayCanvas, type CharInfo } from "@/components/PlayCanvas";
import { GameReplay } from "@/components/GameReplay";

export const dynamic = "force-dynamic";

export const metadata = { title: "게임 진행" };

export default async function PlayPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = getGame(gameId);
  if (!game) notFound();

  const chars: Record<string, CharInfo> = {};
  for (const p of game.players) {
    const ch = getCharacter(p.characterId);
    if (ch)
      chars[p.characterId] = {
        name: ch.name,
        image: ch.image,
        team: ch.team,
        firstNight: ch.firstNight,
        otherNight: ch.otherNight,
      };
  }

  if (game.status === "finished") {
    return <GameReplay game={game} history={getHistory(gameId)} chars={chars} />;
  }
  return <PlayCanvas game={game} chars={chars} />;
}
