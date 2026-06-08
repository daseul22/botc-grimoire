"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { charactersForSheet, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import {
  advancePhase,
  createGame,
  deleteGame,
  finishGame,
  getGame,
  getGameConfig,
  redrawRoles,
  savePositions,
  setLock,
  setStatus,
  toggleMarker,
  type RoleAssignment,
} from "@/lib/games";
import { TEAM_MAP } from "@/lib/constants";
import { alignmentOf, CORE_TEAMS, ratioTotal, type Ratio } from "@/lib/ratio";
import type { Character, Game, Sheet } from "@/lib/types";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 제외 제외하고 비율에 맞춰 핵심 4직업군에서 랜덤 배정. 좌석 순서대로 섞어 반환.
function assignRoles(
  sheet: Sheet,
  excludedIds: string[],
  counts: Ratio,
): { roles: RoleAssignment[] } | { error: string } {
  const excluded = new Set(excludedIds);
  const pools: Record<string, Character[]> = {
    townsfolk: [],
    outsider: [],
    minion: [],
    demon: [],
  };
  for (const c of charactersForSheet(sheet))
    if ((CORE_TEAMS as string[]).includes(c.team) && !excluded.has(c.id))
      pools[c.team].push(c);

  for (const t of CORE_TEAMS)
    if (pools[t].length < counts[t])
      return {
        error: `${TEAM_MAP[t].label.ko} 직업이 부족합니다 (필요 ${counts[t]}, 사용 가능 ${pools[t].length}).`,
      };

  const picked: Character[] = [];
  for (const t of CORE_TEAMS) picked.push(...shuffle(pools[t]).slice(0, counts[t]));
  const roles = shuffle(picked).map((c, seat) => ({
    seat,
    characterId: c.id,
    alignment: alignmentOf(c.team),
  }));
  return { roles };
}

const resolveSheet = (sheetId: string) => getSheet(sheetId) ?? getCustomSheet(sheetId);

export async function startGameAction(input: {
  sheetId: string;
  excludedIds: string[];
  counts: Ratio;
  nicknames: string[];
}): Promise<{ error: string } | void> {
  const sheet = resolveSheet(input.sheetId);
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };

  // 닉네임 미입력 시 "플레이어 N" 기본값
  const nicknames = input.nicknames.map((n, i) => n.trim() || `플레이어 ${i + 1}`);
  if (ratioTotal(input.counts) !== nicknames.length)
    return { error: "직업군 비율 합이 플레이어 수와 다릅니다." };

  const res = assignRoles(sheet, input.excludedIds, input.counts);
  if ("error" in res) return res;

  const n = nicknames.length;
  const players = res.roles.map((r) => {
    const angle = (r.seat / n) * Math.PI * 2 - Math.PI / 2;
    return {
      seat: r.seat,
      nickname: nicknames[r.seat],
      characterId: r.characterId,
      alignment: r.alignment as "good" | "evil",
      x: 0.5 + 0.4 * Math.cos(angle),
      y: 0.5 + 0.42 * Math.sin(angle),
    };
  });

  const id = createGame({
    sheetId: input.sheetId,
    sheetName: sheet.name.ko,
    config: { excludedIds: input.excludedIds, counts: input.counts },
    players,
  });
  redirect(`/play/${id}`);
}

export async function redrawAction(gameId: string): Promise<Game | { error: string }> {
  const cfg = getGameConfig(gameId);
  if (!cfg) return { error: "게임을 찾을 수 없습니다." };
  const sheet = resolveSheet(cfg.sheetId);
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };
  const res = assignRoles(sheet, cfg.excludedIds, cfg.counts as Ratio);
  if ("error" in res) return res;
  redrawRoles(gameId, res.roles);
  return getGame(gameId)!;
}

export async function advancePhaseAction(gameId: string): Promise<Game> {
  advancePhase(gameId);
  return getGame(gameId)!;
}

export async function setStatusAction(
  gameId: string,
  seat: number,
  status: string,
): Promise<Game> {
  setStatus(gameId, seat, status);
  return getGame(gameId)!;
}

export async function toggleMarkerAction(
  gameId: string,
  seat: number,
  markerId: string,
): Promise<Game> {
  toggleMarker(gameId, seat, markerId);
  return getGame(gameId)!;
}

export async function toggleLockAction(
  gameId: string,
  seat: number,
  locked: boolean,
): Promise<Game> {
  setLock(gameId, seat, locked);
  return getGame(gameId)!;
}

export async function finishGameAction(
  gameId: string,
  result: "good" | "evil",
): Promise<void> {
  finishGame(gameId, result);
  revalidatePath(`/play/${gameId}`);
  redirect(`/play/${gameId}`);
}

export async function savePositionsAction(
  gameId: string,
  positions: { seat: number; x: number; y: number }[],
): Promise<void> {
  savePositions(gameId, positions);
}

export async function deleteGameAction(gameId: string): Promise<void> {
  deleteGame(gameId);
  revalidatePath("/games");
}
