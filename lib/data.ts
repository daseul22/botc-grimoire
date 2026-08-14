import { getDb } from "./db";
import {
  getBehaviorOverride,
  getCustomCharacter,
  listCustomCharacters,
} from "./custom-characters";
import type {
  Character,
  EditionId,
  Localized,
  NightAction,
  RulesSection,
  Sheet,
  Team,
} from "./types";

// ── row types (SQLite 컬럼) ──
type CharRow = {
  id: string;
  sort: number;
  name_ko: string;
  name_en: string;
  edition: string;
  team: string;
  ability_ko: string;
  ability_en: string;
  first_order: number | null;
  first_reminder_ko: string | null;
  first_reminder_en: string | null;
  other_order: number | null;
  other_reminder_ko: string | null;
  other_reminder_en: string | null;
  reminders: string;
  setup: number;
  setup_note_ko: string | null;
  setup_note_en: string | null;
  flavor_ko: string | null;
  flavor_en: string | null;
  detail_ko: string | null;
  detail_en: string | null;
  howto_ko: string;
  howto_en: string;
  jinxes_ko: string;
  jinxes_en: string;
  image: string | null;
};
type SheetRow = {
  id: string;
  name_ko: string;
  name_en: string;
  description_ko: string | null;
  description_en: string | null;
  difficulty: string | null;
};
type RuleRow = {
  id: string;
  ord: number;
  title_ko: string;
  title_en: string;
  body_ko: string;
  body_en: string;
};

const lz = (ko: string | null, en: string | null): Localized | null =>
  ko != null || en != null ? { ko: ko ?? "", en: en ?? "" } : null;

const night = (order: number | null, ko: string | null, en: string | null): NightAction =>
  order != null ? { order, reminder: lz(ko, en) } : null;

function rowToCharacter(r: CharRow): Character {
  const c: Character = {
    id: r.id,
    name: { ko: r.name_ko, en: r.name_en },
    edition: r.edition as EditionId,
    team: r.team as Team,
    ability: { ko: r.ability_ko, en: r.ability_en },
    firstNight: night(r.first_order, r.first_reminder_ko, r.first_reminder_en),
    otherNight: night(r.other_order, r.other_reminder_ko, r.other_reminder_en),
    reminders: JSON.parse(r.reminders) as string[],
    setup: !!r.setup,
  };
  const setupNote = lz(r.setup_note_ko, r.setup_note_en);
  if (setupNote) c.setupNote = setupNote;
  const flavor = lz(r.flavor_ko, r.flavor_en);
  if (flavor) c.flavor = flavor;
  const detail = lz(r.detail_ko, r.detail_en);
  if (detail) c.detail = detail;
  const howKo = JSON.parse(r.howto_ko) as string[];
  const howEn = JSON.parse(r.howto_en) as string[];
  if (howKo.length || howEn.length) c.howTo = { ko: howKo, en: howEn };
  const jxKo = JSON.parse(r.jinxes_ko) as string[];
  const jxEn = JSON.parse(r.jinxes_en) as string[];
  if (jxKo.length || jxEn.length) c.jinxes = { ko: jxKo, en: jxEn };
  if (r.image != null) c.image = r.image;
  return c;
}

const db = getDb();

export const characters: Character[] = (
  db.prepare("SELECT * FROM characters ORDER BY sort").all() as CharRow[]
).map(rowToCharacter);

const charById = new Map(characters.map((c) => [c.id, c]));

// sheet_characters → 시트별 정렬된 id 목록
const idsBySheet: Record<string, string[]> = {};
for (const r of db
  .prepare("SELECT sheet_id, character_id FROM sheet_characters ORDER BY position")
  .all() as { sheet_id: string; character_id: string }[]) {
  (idsBySheet[r.sheet_id] ??= []).push(r.character_id);
}

export const sheets: Sheet[] = (
  db.prepare("SELECT * FROM sheets ORDER BY sort").all() as SheetRow[]
).map((r) => {
  const s: Sheet = {
    id: r.id,
    name: { ko: r.name_ko, en: r.name_en },
    characterIds: idsBySheet[r.id] ?? [],
  };
  const desc = lz(r.description_ko, r.description_en);
  if (desc) s.description = desc;
  if (r.difficulty) s.difficulty = r.difficulty as Sheet["difficulty"];
  return s;
});

export const rules: RulesSection[] = (
  db.prepare("SELECT * FROM rules ORDER BY ord").all() as RuleRow[]
).map((r) => ({
  id: r.id,
  order: r.ord,
  title: { ko: r.title_ko, en: r.title_en },
  body: { ko: r.body_ko, en: r.body_en },
}));

/**
 * 동작이 수정된 공식 직업이면 override를 얹어 돌려준다.
 * 수정분만 `behavior`가 채워지므로, 클라이언트로 나가는 payload에는 바뀐 직업만 실린다
 * (공식 기본값은 data/behaviors.json으로 이미 클라 번들에 있음).
 */
function withOverride(c: Character): Character {
  const o = getBehaviorOverride(c.id);
  return o ? { ...c, behavior: o } : c;
}

/**
 * 직업 조회 — 공식 183종 우선, 없으면 커스텀 직업.
 * 이 한 곳이 커스텀을 알기 때문에 charactersForSheet·characterMapForGame 등
 * 기존 소비자가 수정 없이 커스텀 직업을 그린다.
 */
export function getCharacter(id: string): Character | undefined {
  const official = charById.get(id);
  if (official) return withOverride(official);
  return getCustomCharacter(id);
}

/**
 * 공식 + 커스텀 전체 목록(동적 페이지 전용).
 * 모듈 최상단의 `characters`는 SSG 입력이라 정적으로 두고, 가변인 커스텀은 이 함수로만 합친다.
 */
export function allCharacters(): Character[] {
  return [...characters.map(withOverride), ...listCustomCharacters()];
}

export function getSheet(id: string): Sheet | undefined {
  return sheets.find((s) => s.id === id);
}

export function charactersForSheet(sheet: Sheet): Character[] {
  return sheet.characterIds
    .map(getCharacter)
    .filter((c): c is Character => Boolean(c));
}
