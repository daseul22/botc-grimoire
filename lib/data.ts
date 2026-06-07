import charactersData from "@/data/characters.json";
import sheetsData from "@/data/sheets.json";
import rulesData from "@/data/rules.json";
import { TEAMS } from "./constants";
import type { Character, RulesSection, Sheet, Team } from "./types";

export const characters = charactersData as unknown as Character[];
export const sheets = sheetsData as unknown as Sheet[];
export const rules = (rulesData as unknown as RulesSection[])
  .slice()
  .sort((a, b) => a.order - b.order);

export function getCharacter(id: string): Character | undefined {
  return characters.find((c) => c.id === id);
}

export function getSheet(id: string): Sheet | undefined {
  return sheets.find((s) => s.id === id);
}

export function charactersForSheet(sheet: Sheet): Character[] {
  return sheet.characterIds
    .map(getCharacter)
    .filter((c): c is Character => Boolean(c));
}

/** 직업들을 팀 순서(마을주민→전설)대로 그룹핑 */
export function groupByTeam(list: Character[]): { team: Team; items: Character[] }[] {
  return TEAMS.map((t) => ({
    team: t.id,
    items: list.filter((c) => c.team === t.id),
  })).filter((g) => g.items.length > 0);
}
