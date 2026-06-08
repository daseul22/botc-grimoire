"use server";

import { redirect } from "next/navigation";
import { charactersForSheet, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { createGame, savePositions, type NewPlayer } from "@/lib/games";
import { TEAM_MAP } from "@/lib/constants";
import { alignmentOf, CORE_TEAMS, ratioTotal, type Ratio } from "@/lib/ratio";
import type { Character } from "@/lib/types";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function startGameAction(input: {
  sheetId: string;
  excludedIds: string[];
  counts: Ratio;
  nicknames: string[];
}): Promise<{ error: string } | void> {
  const sheet = getSheet(input.sheetId) ?? getCustomSheet(input.sheetId);
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };

  const nicknames = input.nicknames.map((n) => n.trim());
  if (nicknames.some((n) => !n)) return { error: "모든 닉네임을 입력하세요." };
  if (ratioTotal(input.counts) !== nicknames.length)
    return { error: "직업군 비율 합이 플레이어 수와 다릅니다." };

  const excluded = new Set(input.excludedIds);
  const pools: Record<string, Character[]> = {
    townsfolk: [],
    outsider: [],
    minion: [],
    demon: [],
  };
  for (const c of charactersForSheet(sheet)) {
    if (CORE_TEAMS.includes(c.team as never) && !excluded.has(c.id))
      pools[c.team].push(c);
  }

  for (const t of CORE_TEAMS) {
    if (pools[t].length < input.counts[t])
      return {
        error: `${TEAM_MAP[t].label.ko} 직업이 부족합니다 (필요 ${input.counts[t]}, 사용 가능 ${pools[t].length}). 제외를 줄이거나 비율을 조정하세요.`,
      };
  }

  const picked: Character[] = [];
  for (const t of CORE_TEAMS) picked.push(...shuffle(pools[t]).slice(0, input.counts[t]));
  const order = shuffle(picked);

  const n = nicknames.length;
  const players: NewPlayer[] = nicknames.map((nick, i) => {
    const ch = order[i];
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2; // 12시 방향부터 시계방향
    return {
      seat: i,
      nickname: nick,
      characterId: ch.id,
      alignment: alignmentOf(ch.team),
      x: 0.5 + 0.4 * Math.cos(angle),
      y: 0.5 + 0.42 * Math.sin(angle),
    };
  });

  const id = createGame({
    sheetId: input.sheetId,
    sheetName: sheet.name.ko,
    players,
  });
  redirect(`/play/${id}`);
}

export async function savePositionsAction(
  gameId: string,
  positions: { seat: number; x: number; y: number }[],
): Promise<void> {
  savePositions(gameId, positions);
}
