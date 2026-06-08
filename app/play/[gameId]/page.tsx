import { notFound } from "next/navigation";
import { getGame, getHistory } from "@/lib/games";
import { charactersForSheet, getCharacter, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import type { Character } from "@/lib/types";
import { PlayCanvas } from "@/components/PlayCanvas";
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

  // 현재 시트의 전체 직업(상세 데이터 포함)을 통째로 넘긴다.
  // 재추첨·직업변경 후에도 클라이언트가 새 직업 정보를 바로 그릴 수 있게 함.
  const sheet = getSheet(game.sheetId) ?? getCustomSheet(game.sheetId);
  const map = new Map<string, Character>();
  if (sheet) for (const c of charactersForSheet(sheet)) map.set(c.id, c);
  for (const p of game.players)
    if (!map.has(p.characterId)) {
      const c = getCharacter(p.characterId);
      if (c) map.set(c.id, c);
    }
  const sheetChars = [...map.values()];

  if (game.status === "finished") {
    return (
      <GameReplay game={game} history={getHistory(gameId)} sheetChars={sheetChars} />
    );
  }
  return <PlayCanvas game={game} sheetChars={sheetChars} />;
}
