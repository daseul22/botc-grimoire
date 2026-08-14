// 일회성 마이그레이션 도구 — 이관 전 lib/night-actions.ts에 하드코딩돼 있던 직업별 스펙을
// data/behaviors.json(진실 소스)으로 추출한다. 133개 중 하나만 손으로 잘못 옮겨도 조용히
// 오작동하므로, 원본 코드에서 직접 읽어 기계적으로 덤프한다.
//
// 실행: npx tsx scripts/extract-behaviors.ts
// 원본은 git에서 꺼내오므로(scripts/behavior-origin.ts) 이관 후에도 언제든 재현된다.
// 등가성 검증은 scripts/verify-behaviors.ts.

import fs from "node:fs";
import path from "node:path";
import { loadOriginalSpecs } from "./behavior-origin";
import type { ActionSpec, CharacterBehavior } from "../lib/behaviors";

const ROOT = path.resolve(import.meta.dirname, "..");

// 이관 전 lib/games/record.ts·night-actions.ts에 직업 id 목록으로 하드코딩돼 있던
// 부수효과들 — behavior 플래그로 승격한다.
const ROLE_CHANGE = ["pithag", "kazali", "lordoftyphon", "summoner"];
const GAIN_RESULT_ABILITY = ["philosopher"];
const SHOWS_WITHOUT_RECORD = ["marionette", "magician"];

// tsx가 CJS로 트랜스파일해 top-level await을 못 쓰므로 main()으로 감싼다.
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function main() {
const o = await loadOriginalSpecs();

const out: Record<string, CharacterBehavior> = {};
const at = (id: string): CharacterBehavior => (out[id] ??= {});

for (const [id, spec] of Object.entries(o.ACTION_SPECS)) at(id).night = spec as ActionSpec;
for (const [id, spec] of Object.entries(o.OTHER_NIGHT_SPECS)) at(id).otherNight = spec as ActionSpec;
for (const [id, spec] of Object.entries(o.DAY_ACTION_SPECS)) at(id).day = spec as ActionSpec;
for (const [id, text] of Object.entries(o.ACTION_CRITERIA)) at(id).criteria = text;
for (const [id, kind] of Object.entries(o.MISREGISTER_ROLES)) at(id).misregister = kind;
for (const id of o.ST_CHOOSES_TARGETS) at(id).stChoosesTargets = true;
for (const id of ROLE_CHANGE) at(id).roleChange = true;
for (const id of GAIN_RESULT_ABILITY) at(id).gainResultAbility = true;
for (const id of SHOWS_WITHOUT_RECORD) at(id).showsWithoutRecord = true;

// 키 정렬 — diff 안정성. 직업 id 알파벳순, 항목 내 필드는 아래 선언 순서로 고정.
const FIELD_ORDER: (keyof CharacterBehavior)[] = [
  "night",
  "otherNight",
  "day",
  "criteria",
  "misregister",
  "stChoosesTargets",
  "roleChange",
  "gainResultAbility",
  "showsWithoutRecord",
];
const sorted: Record<string, CharacterBehavior> = {};
for (const id of Object.keys(out).sort()) {
  const b: CharacterBehavior = {};
  for (const f of FIELD_ORDER)
    if (out[id][f] !== undefined) (b as Record<string, unknown>)[f] = out[id][f];
  sorted[id] = b;
}

fs.writeFileSync(path.join(ROOT, "data", "behaviors.json"), JSON.stringify(sorted, null, 2) + "\n");

const n = (pred: (b: CharacterBehavior) => boolean) => Object.values(sorted).filter(pred).length;
console.log(
  `wrote data/behaviors.json → ${Object.keys(sorted).length} characters ` +
    `(night ${n((b) => !!b.night)}, otherNight ${n((b) => !!b.otherNight)}, ` +
    `day ${n((b) => !!b.day)}, criteria ${n((b) => !!b.criteria)})`,
);
}
