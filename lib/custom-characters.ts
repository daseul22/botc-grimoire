// 커스텀 직업 저장소 — 서버 전용(better-sqlite3 import).
//
// 사용자가 만든 직업과, 공식 직업의 동작을 수정한 분(override)을 보관한다.
// 커스텀 시트와 같은 이유로 콘텐츠 테이블(characters)과 분리한다 — seed-db가 건드리지 않으므로
// `npm run db:seed`로 재시드해도 보존된다.
//
// 동작 정의(behavior)는 저장할 때 lib/behaviors.ts 레지스트리에도 install한다.
// 서버 프로세스는 하나이고 직업 id가 전역 유니크(커스텀은 `x-` 접두)라 전역 병합이 안전하다.

import { getDb } from "./db";
import {
  baseBehavior,
  installBehaviors,
  type BehaviorMap,
  type CharacterBehavior,
} from "./behaviors";
import type { Character, EditionId, Localized, NightAction, Team } from "./types";

getDb().exec(`
CREATE TABLE IF NOT EXISTS custom_characters (
  id TEXT PRIMARY KEY,
  name_ko TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '',
  edition TEXT NOT NULL DEFAULT 'other',
  team TEXT NOT NULL,
  ability_ko TEXT NOT NULL DEFAULT '', ability_en TEXT NOT NULL DEFAULT '',
  first_order INTEGER, first_reminder_ko TEXT,
  other_order INTEGER, other_reminder_ko TEXT,
  reminders TEXT NOT NULL DEFAULT '[]',
  setup INTEGER NOT NULL DEFAULT 0, setup_note_ko TEXT,
  flavor_ko TEXT, detail_ko TEXT,
  image TEXT,
  behavior TEXT NOT NULL DEFAULT '{}',
  owner_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS character_overrides (
  character_id TEXT PRIMARY KEY,
  behavior TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

type Row = {
  id: string;
  name_ko: string;
  name_en: string;
  edition: string;
  team: string;
  ability_ko: string;
  ability_en: string;
  first_order: number | null;
  first_reminder_ko: string | null;
  other_order: number | null;
  other_reminder_ko: string | null;
  reminders: string;
  setup: number;
  setup_note_ko: string | null;
  flavor_ko: string | null;
  detail_ko: string | null;
  image: string | null;
  behavior: string;
  owner_id: number | null;
  created_at: string;
};

/** 커스텀 직업 입력 — Character에서 서버가 채우는 필드(id·custom·ownerId)를 뺀 모양. */
export type CustomCharacterInput = {
  nameKo: string;
  nameEn?: string;
  team: Team;
  abilityKo: string;
  abilityEn?: string;
  /** 첫밤 순서(없으면 밤에 안 깸). 공식 직업 사이에 끼워 넣을 수 있게 소수도 허용하지 않고 정수로 둔다. */
  firstOrder?: number | null;
  firstReminderKo?: string;
  otherOrder?: number | null;
  otherReminderKo?: string;
  reminders?: string[];
  setup?: boolean;
  setupNoteKo?: string;
  flavorKo?: string;
  detailKo?: string;
  /** 토큰 이미지 경로 — 공식 아이콘 재사용(`/icons/imp.webp`) 또는 업로드분(`/icons/custom/...`). */
  image?: string;
  behavior: CharacterBehavior;
};

const lz = (ko: string | null | undefined, en?: string | null): Localized | null =>
  ko != null || en != null ? { ko: ko ?? "", en: en ?? ko ?? "" } : null;

const night = (order: number | null, ko: string | null): NightAction =>
  order != null ? { order, reminder: lz(ko) } : null;

function rowToCharacter(r: Row): Character {
  const c: Character = {
    id: r.id,
    name: { ko: r.name_ko, en: r.name_en || r.name_ko },
    edition: r.edition as EditionId,
    team: r.team as Team,
    ability: { ko: r.ability_ko, en: r.ability_en || r.ability_ko },
    firstNight: night(r.first_order, r.first_reminder_ko),
    otherNight: night(r.other_order, r.other_reminder_ko),
    reminders: safeParse<string[]>(r.reminders, []),
    setup: !!r.setup,
    custom: true,
    ownerId: r.owner_id,
    behavior: safeParse<CharacterBehavior>(r.behavior, {}),
  };
  const setupNote = lz(r.setup_note_ko);
  if (setupNote) c.setupNote = setupNote;
  const flavor = lz(r.flavor_ko);
  if (flavor) c.flavor = flavor;
  const detail = lz(r.detail_ko);
  if (detail) c.detail = detail;
  if (r.image) c.image = r.image;
  return c;
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ── 캐시 ──
// getCharacter()가 공식 miss마다 DB를 때리지 않도록 프로세스 메모리에 들고 있는다.
// 쓰기 경로가 전부 invalidate()를 거치므로 stale이 남지 않는다.

let cache: Map<string, Character> | null = null;
let overrideCache: Map<string, CharacterBehavior> | null = null;

function invalidate(): void {
  cache = null;
  overrideCache = null;
}

function loadAll(): Map<string, Character> {
  if (cache) return cache;
  const rows = getDb()
    .prepare("SELECT * FROM custom_characters ORDER BY created_at")
    .all() as Row[];
  const m = new Map<string, Character>();
  const behaviors: BehaviorMap = {};
  for (const r of rows) {
    const c = rowToCharacter(r);
    m.set(c.id, c);
    if (c.behavior) behaviors[c.id] = c.behavior;
  }
  installBehaviors(behaviors);
  cache = m;
  return m;
}

function loadOverrides(): Map<string, CharacterBehavior> {
  if (overrideCache) return overrideCache;
  const rows = getDb()
    .prepare("SELECT character_id, behavior FROM character_overrides")
    .all() as { character_id: string; behavior: string }[];
  const m = new Map<string, CharacterBehavior>();
  const behaviors: BehaviorMap = {};
  for (const r of rows) {
    const b = safeParse<CharacterBehavior>(r.behavior, {});
    m.set(r.character_id, b);
    behaviors[r.character_id] = b;
  }
  installBehaviors(behaviors);
  overrideCache = m;
  return m;
}

/** 저장된 커스텀 직업·override를 레지스트리에 반영한다. */
export function ensureBehaviorsInstalled(): void {
  loadAll();
  loadOverrides();
}

// 모듈이 로드되는 순간 주입해 둔다. lib/data.ts가 이 파일을 import하므로
// 직업 데이터를 읽는 모든 서버 경로(페이지·액션·show)에서 레지스트리가 항상 채워진 상태가 된다.
ensureBehaviorsInstalled();

// ── 조회 ──

export function listCustomCharacters(): Character[] {
  return [...loadAll().values()];
}

export function getCustomCharacter(id: string): Character | undefined {
  return loadAll().get(id);
}

/**
 * 이 직업이 배정된 좌석을 가진 게임 수(진행 중 + 종료된 복기 모두).
 *
 * 삭제 가드용. 좌석의 `character_id`는 게임 전역 정체성이라 직업을 지워도 남는데,
 * 정의가 사라지면 직업맵에서 빠져 토큰·이름이 안 그려지고 스펙도 폴백으로 떨어진다.
 * 즉 **과거 게임과 복기가 소급 손상된다** — "정체성을 안 덮어써서 과거가 안 깨진다"는
 * 그리모어 엔진의 전제를 지키려면 사용 중인 직업은 지울 수 없어야 한다.
 */
export function countGamesUsing(characterId: string): number {
  const r = getDb()
    .prepare("SELECT COUNT(DISTINCT game_id) c FROM game_players WHERE character_id = ?")
    .get(characterId) as { c: number } | undefined;
  return r?.c ?? 0;
}

/** 커스텀 직업 소유자 user id (없으면 null). 수정/삭제 권한 판정용. */
export function getCustomCharacterOwner(id: string): number | null {
  const r = getDb()
    .prepare("SELECT owner_id FROM custom_characters WHERE id = ?")
    .get(id) as { owner_id: number | null } | undefined;
  return r ? r.owner_id : null;
}

/** 공식 직업의 동작 수정분. 없으면 undefined(= data/behaviors.json 기본값 사용). */
export function getBehaviorOverride(characterId: string): CharacterBehavior | undefined {
  return loadOverrides().get(characterId);
}

/** 동작이 수정된 공식 직업 id 목록 — 관리 화면에서 '기본값으로 되돌리기' 대상 표시용. */
export function listOverriddenIds(): string[] {
  return [...loadOverrides().keys()];
}

// ── 쓰기 ──

const toRow = (id: string, input: CustomCharacterInput) => ({
  id,
  name_ko: input.nameKo,
  name_en: input.nameEn ?? "",
  edition: "other",
  team: input.team,
  ability_ko: input.abilityKo,
  ability_en: input.abilityEn ?? "",
  first_order: input.firstOrder ?? null,
  first_reminder_ko: input.firstReminderKo || null,
  other_order: input.otherOrder ?? null,
  other_reminder_ko: input.otherReminderKo || null,
  reminders: JSON.stringify(input.reminders ?? []),
  setup: input.setup ? 1 : 0,
  setup_note_ko: input.setupNoteKo || null,
  flavor_ko: input.flavorKo || null,
  detail_ko: input.detailKo || null,
  image: input.image || null,
  behavior: JSON.stringify(input.behavior ?? {}),
});

export function createCustomCharacter(
  input: CustomCharacterInput & { ownerId?: number | null },
): string {
  // `x-` 접두로 공식 183종과 id 공간을 분리한다 — 레지스트리 전역 병합이 충돌하지 않는 근거.
  const id = "x-" + crypto.randomUUID().slice(0, 8);
  getDb()
    .prepare(
      `INSERT INTO custom_characters
       (id,name_ko,name_en,edition,team,ability_ko,ability_en,
        first_order,first_reminder_ko,other_order,other_reminder_ko,
        reminders,setup,setup_note_ko,flavor_ko,detail_ko,image,behavior,owner_id,created_at)
       VALUES (@id,@name_ko,@name_en,@edition,@team,@ability_ko,@ability_en,
        @first_order,@first_reminder_ko,@other_order,@other_reminder_ko,
        @reminders,@setup,@setup_note_ko,@flavor_ko,@detail_ko,@image,@behavior,@owner_id,@created_at)`,
    )
    .run({
      ...toRow(id, input),
      owner_id: input.ownerId ?? null,
      created_at: new Date().toISOString(),
    });
  invalidate();
  // 캐시 무효화만으로는 레지스트리가 안 바뀐다(조회 함수는 DB를 보지 않는다) → 즉시 주입.
  installBehaviors({ [id]: input.behavior ?? {} });
  return id;
}

export function updateCustomCharacter(id: string, input: CustomCharacterInput): void {
  getDb()
    .prepare(
      `UPDATE custom_characters SET
        name_ko=@name_ko, name_en=@name_en, team=@team,
        ability_ko=@ability_ko, ability_en=@ability_en,
        first_order=@first_order, first_reminder_ko=@first_reminder_ko,
        other_order=@other_order, other_reminder_ko=@other_reminder_ko,
        reminders=@reminders, setup=@setup, setup_note_ko=@setup_note_ko,
        flavor_ko=@flavor_ko, detail_ko=@detail_ko, image=@image, behavior=@behavior
       WHERE id=@id`,
    )
    .run(toRow(id, input));
  invalidate();
  installBehaviors({ [id]: input.behavior ?? {} });
}

/**
 * 커스텀 직업의 **동작만** 갱신한다(이름·아이콘 등 나머지는 그대로).
 * 직업 상세의 동작 설정 패널이 쓰는 좁은 쓰기 경로 — 전체 폼을 왕복시키지 않으려고 분리했다.
 */
export function updateCustomCharacterBehavior(id: string, behavior: CharacterBehavior): void {
  getDb()
    .prepare("UPDATE custom_characters SET behavior = ? WHERE id = ?")
    .run(JSON.stringify(behavior ?? {}), id);
  invalidate();
  installBehaviors({ [id]: behavior ?? {} });
}

export function deleteCustomCharacter(id: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    // 시트에서도 함께 빼야 "없는 직업이 든 시트"가 남지 않는다.
    db.prepare("DELETE FROM custom_sheet_characters WHERE character_id = ?").run(id);
    db.prepare("DELETE FROM custom_characters WHERE id = ?").run(id);
  });
  tx();
  invalidate();
  // 지워진 직업의 스펙이 레지스트리에 남지 않게 비운다(id는 재사용되지 않지만 상태를 정확히 유지).
  installBehaviors({ [id]: {} });
}

/**
 * 공식 직업의 동작을 덮어쓴다. **모든 게임에 전역 적용**되므로 호출측이 권한을 강하게 가둔다.
 * 개별 변형이 필요하면 커스텀 직업으로 복제하는 쪽이 안전하다.
 */
export function setBehaviorOverride(characterId: string, behavior: CharacterBehavior): void {
  getDb()
    .prepare(
      `INSERT INTO character_overrides (character_id,behavior,updated_at) VALUES (?,?,?)
       ON CONFLICT(character_id) DO UPDATE SET behavior=excluded.behavior, updated_at=excluded.updated_at`,
    )
    .run(characterId, JSON.stringify(behavior), new Date().toISOString());
  invalidate();
  installBehaviors({ [characterId]: behavior });
}

/** 공식 직업 동작을 data/behaviors.json 기본값으로 되돌린다. */
export function clearBehaviorOverride(characterId: string): void {
  getDb().prepare("DELETE FROM character_overrides WHERE character_id = ?").run(characterId);
  invalidate();
  // 레지스트리는 id 단위 교체만 지원하므로, 이미 install된 오버레이를 지우는 대신
  // 공식 기본값을 다시 덮어써서 되돌린다(프로세스 재시작 없이 즉시 반영).
  installBehaviors({ [characterId]: baseBehavior(characterId) ?? {} });
}
