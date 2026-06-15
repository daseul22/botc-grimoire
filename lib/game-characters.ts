// 게임의 직업 맵(상세 데이터 포함) 조립 — 서버 전용(better-sqlite3 의존).
//
// 시트 전체 직업 + 시트에 없는 인플레이 직업(재추첨/직업변경으로 들어온 것)을 보충해 Map으로 돌려준다.
// 진행 관련 4개 서버 페이지(play / seat / claim / show)가 같은 보충 규칙을 쓰도록 단일화 →
// "바뀐 직업이 안 보이는" 류의 렌더 사고를 구조적으로 예방.
import { charactersForSheet, getCharacter, getSheet } from "./data";
import { getCustomSheet } from "./custom-sheets";
import type { Character } from "./types";

export function characterMapForGame(game: {
  sheetId: string;
  players: { characterId: string }[];
}): Map<string, Character> {
  const sheet = getSheet(game.sheetId) ?? getCustomSheet(game.sheetId);
  const map = new Map<string, Character>();
  if (sheet) for (const c of charactersForSheet(sheet)) map.set(c.id, c);
  for (const p of game.players)
    if (!map.has(p.characterId)) {
      const c = getCharacter(p.characterId);
      if (c) map.set(c.id, c);
    }
  return map;
}
