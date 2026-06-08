import { TEAMS } from "./constants";
import type { Character, Team } from "./types";

/** 직업들을 팀 순서(마을주민→로릭)대로 그룹핑. 순수 함수 — 클라이언트에서도 사용 가능. */
export function groupByTeam(
  list: Character[],
): { team: Team; items: Character[] }[] {
  return TEAMS.map((t) => ({
    team: t.id,
    items: list.filter((c) => c.team === t.id),
  })).filter((g) => g.items.length > 0);
}
