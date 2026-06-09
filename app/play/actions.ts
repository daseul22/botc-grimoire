"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { charactersForSheet, getCharacter, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import {
  advancePhase,
  clearAction,
  createGame,
  deleteGame,
  finishGame,
  getGame,
  getGameConfig,
  prevPhase,
  recordAction,
  redrawRoles,
  savePositions,
  setBluffs,
  setLock,
  setMemo,
  setRoles,
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
  const game = getGame(gameId);
  if (!cfg || !game) return { error: "게임을 찾을 수 없습니다." };
  const sheet = resolveSheet(cfg.sheetId);
  if (!sheet) return { error: "시트를 찾을 수 없습니다." };

  // 저장된 config가 비어 있어도(구버전 게임) 안전하도록, 현재 배정된
  // 플레이어들의 팀 구성에서 비율을 그대로 도출해 재추첨한다.
  const counts: Ratio = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const p of game.players) {
    const team = getCharacter(p.characterId)?.team;
    if (team && team in counts) counts[team as keyof Ratio]++;
  }

  const res = assignRoles(sheet, cfg.excludedIds, counts);
  if ("error" in res) return res;
  redrawRoles(gameId, res.roles);
  return getGame(gameId)!;
}

export async function advancePhaseAction(gameId: string): Promise<Game> {
  advancePhase(gameId);
  return getGame(gameId)!;
}

export async function prevPhaseAction(gameId: string): Promise<Game> {
  prevPhase(gameId);
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

export async function recordActionAction(
  gameId: string,
  actorSeat: number,
  characterId: string,
  targets: number[],
  result: string,
  bluff = false,
): Promise<Game> {
  recordAction(gameId, { actorSeat, characterId, targets, result, bluff });
  return getGame(gameId)!;
}

export async function clearActionAction(
  gameId: string,
  actorSeat: number,
  characterId = "",
  bluff = false,
): Promise<Game> {
  clearAction(gameId, actorSeat, characterId, bluff);
  return getGame(gameId)!;
}

export async function setBluffsAction(
  gameId: string,
  ids: string[],
): Promise<Game> {
  setBluffs(gameId, ids);
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

export async function setMemoAction(
  gameId: string,
  seat: number,
  memo: string,
): Promise<Game> {
  setMemo(gameId, seat, memo);
  return getGame(gameId)!;
}

/**
 * 직업 수동 변경 (1일차 밤). 다른 좌석이 그 직업을 이미 가졌으면 서로 교체.
 */
export async function setRoleAction(
  gameId: string,
  seat: number,
  characterId: string,
): Promise<Game | { error: string }> {
  const game = getGame(gameId);
  if (!game) return { error: "게임을 찾을 수 없습니다." };
  const ch = getCharacter(characterId);
  if (!ch) return { error: "직업을 찾을 수 없습니다." };
  const me = game.players.find((p) => p.seat === seat);
  if (!me) return { error: "플레이어를 찾을 수 없습니다." };
  if (me.characterId === characterId) return game;

  const newAlign = alignmentOf(ch.team);
  const other = game.players.find(
    (p) => p.seat !== seat && p.characterId === characterId,
  );
  if (other) {
    // 교체: 상대는 내 직업/진영을 가져간다
    setRoles(gameId, [
      { seat, characterId, alignment: newAlign },
      { seat: other.seat, characterId: me.characterId, alignment: me.alignment },
    ]);
  } else {
    setRoles(gameId, [{ seat, characterId, alignment: newAlign }]);
  }
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
