// 직업 배정 — 서버 전용(시트 데이터 의존). 게임 시작(play/actions.ts)과 룸 시작(rooms/actions.ts)이 공유.
// ("use server" 파일은 async 액션만 export할 수 있어, 이 동기 헬퍼들을 별도 모듈로 둔다.)
import { charactersForSheet, getSheet } from "./data";
import { getCustomSheet } from "./custom-sheets";
import { TEAM_MAP } from "./constants";
import { alignmentOf, CORE_TEAMS, type Ratio } from "./ratio";
import type { RoleAssignment } from "./games";
import type { Character, Sheet } from "./types";

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 공식/커스텀 어느 쪽이든 시트를 찾는다. */
export const resolveSheet = (sheetId: string): Sheet | undefined =>
  getSheet(sheetId) ?? getCustomSheet(sheetId);

// 제외 직업을 빼고 비율에 맞춰 핵심 4직업군에서 랜덤 배정. 좌석 0..n-1 순서로 섞어 반환.
export function assignRoles(
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
    if ((CORE_TEAMS as string[]).includes(c.team) && !excluded.has(c.id)) pools[c.team].push(c);

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
