import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { charactersForSheet, getCharacter, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import type { Character } from "@/lib/types";
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

  const sheet = getSheet(game.sheetId) ?? getCustomSheet(game.sheetId);
  const map = new Map<string, Character>();
  if (sheet) for (const c of charactersForSheet(sheet)) map.set(c.id, c);
  for (const p of game.players)
    if (!map.has(p.characterId)) {
      const c = getCharacter(p.characterId);
      if (c) map.set(c.id, c);
    }

  return <SeatView game={game} sheetChars={[...map.values()]} />;
}
