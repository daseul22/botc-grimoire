import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { getCharacter } from "@/lib/data";
import { PlayCanvas, type PlayToken } from "@/components/PlayCanvas";

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

  const players: PlayToken[] = game.players.map((p) => {
    const ch = getCharacter(p.characterId);
    return {
      seat: p.seat,
      nickname: p.nickname,
      characterId: p.characterId,
      alignment: p.alignment,
      x: p.x,
      y: p.y,
      name: ch?.name ?? { ko: p.characterId, en: p.characterId },
      image: ch?.image,
      team: ch?.team ?? "townsfolk",
    };
  });

  return (
    <PlayCanvas gameId={game.id} sheetName={game.sheetName} players={players} />
  );
}
