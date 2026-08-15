// 이관 등가성 검증 — data/behaviors.json 기반 조회가 이관 전 하드코딩 스펙과 100% 같은지 확인한다.
//
// 직업 183종 × 페이즈(첫밤/그외밤/낮) × 조회 함수 전부를 원본과 대조한다.
// 값 하나가 어긋나면 "점쟁이가 밤에 안 깨는" 식으로 조용히 오작동하므로, 이관 후 회귀를
// 사람 눈이 아니라 기계가 잡게 한다.
//
// 실행: npm run verify:behaviors
// (이관을 커밋한 뒤에는 BOTC_BEHAVIOR_REV=<이관 직전 리비전>을 지정한다.)

import fs from "node:fs";
import path from "node:path";
import { loadOriginalSpecs } from "./behavior-origin";
import * as now from "../lib/night-actions";

const ROOT = path.resolve(import.meta.dirname, "..");

// ── 이관 후 의도적으로 통일한 용어 ──
//
// docs/번역-일관성-조사-보고서.md의 권고 표준(+ wiki 02·08 채택본)에 맞춰 폐기어를 정리했다.
// 원본(이관 전) 문자열에 **같은 정규화를 적용한 뒤** 비교하므로, 이 변경만 통과하고 나머지
// 등가성은 그대로 검사된다. 반대로 현재 값에 폐기어가 남아 있으면 불일치로 잡히므로
// 이 목록은 "누락 검출기" 역할도 한다(한쪽만 정규화하는 이유).
const TERM_FIXES: [RegExp, string][] = [
  [/데몬/g, "악마"],
  [/마을사람/g, "마을주민"],
  [/레크루스/g, "은둔자"],
  [/스파이(?=[는은이가를을와과])/g, "첩자"],
  // '데몬'(받침 O) → '악마'(받침 X)로 어긋나는 조사 보정. 서술격(악마이다/이며…)은 제외.
  [/악마이(?![다며거기라였])/g, "악마가"],
  [/악마으로/g, "악마로"],
  [/악마을/g, "악마를"],
  [/악마은/g, "악마는"],
  [/악마과/g, "악마와"],
];
const normalizeTerms = (s: string) =>
  TERM_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), s);

/** 키 순서에 흔들리지 않는 직렬화 — deep-equal 비교용. */
function stable(v: unknown): string {
  if (v === undefined) return "∅";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "∅";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

type OriginalModule = Awaited<ReturnType<typeof loadOriginalSpecs>> & {
  actionSpec: (id: string) => unknown;
  nightActionSpec: (id: string, isFirstNight: boolean) => unknown;
  dayActionSpec: (id: string) => unknown;
  specForPhase: (id: string, phase: string, day?: number) => unknown;
  isOncePerGame: (id: string) => boolean;
  showsWithoutRecord: (id: string) => boolean;
  playerChoosesTargets: (id: string, spec: { targets: number; playerPicks?: boolean }) => boolean;
  misregisterWarn: (id: string) => string | undefined;
  showcaseVariants: (spec: unknown) => unknown;
  pickShowcase: (spec: unknown, variant?: number) => unknown;
  markerForAction: (marker: string, result: string) => string;
};

// tsx가 CJS로 트랜스파일해 top-level await을 못 쓰므로 main()으로 감싼다.
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function main() {
const o = (await loadOriginalSpecs()) as OriginalModule;

// 검사 대상 id — 실제 직업 183종 + 원본 스펙에 등재된 모든 키(누락 감지).
const characters = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "characters.json"), "utf8"),
) as { id: string }[];
const ids = [
  ...new Set([
    ...characters.map((c) => c.id),
    ...Object.keys(o.ACTION_SPECS),
    ...Object.keys(o.DAY_ACTION_SPECS),
    ...Object.keys(o.OTHER_NIGHT_SPECS),
    ...Object.keys(o.ACTION_CRITERIA),
    ...Object.keys(o.MISREGISTER_ROLES),
    ...o.ST_CHOOSES_TARGETS,
  ]),
].sort();

const fails: string[] = [];
let checks = 0;

function eq(id: string, what: string, expected: unknown, actual: unknown) {
  checks++;
  // 원본에만 용어 정규화를 적용한다 — 의도한 용어 통일은 통과시키되,
  // 현재 값에 폐기어가 남아 있으면 그대로 불일치로 드러나게.
  const a = normalizeTerms(stable(expected));
  const b = stable(actual);
  if (a !== b) fails.push(`${id} · ${what}\n    이관 전(용어 정규화): ${a}\n    이관 후: ${b}`);
}

for (const id of ids) {
  eq(id, "actionSpec", o.actionSpec(id), now.actionSpec(id));
  eq(id, "nightActionSpec(첫밤)", o.nightActionSpec(id, true), now.nightActionSpec(id, true));
  eq(id, "nightActionSpec(그외밤)", o.nightActionSpec(id, false), now.nightActionSpec(id, false));
  eq(id, "dayActionSpec", o.dayActionSpec(id), now.dayActionSpec(id));
  eq(id, "specForPhase(day)", o.specForPhase(id, "day"), now.specForPhase(id, "day"));
  eq(id, "specForPhase(night,1)", o.specForPhase(id, "night", 1), now.specForPhase(id, "night", 1));
  eq(id, "specForPhase(night,3)", o.specForPhase(id, "night", 3), now.specForPhase(id, "night", 3));
  eq(id, "isOncePerGame", o.isOncePerGame(id), now.isOncePerGame(id));
  eq(id, "showsWithoutRecord", o.showsWithoutRecord(id), now.showsWithoutRecord(id));
  eq(id, "misregisterWarn", o.misregisterWarn(id), now.misregisterWarn(id));
  eq(id, "criteria", o.ACTION_CRITERIA[id], now.actionCriteria(id));
  eq(id, "misregisterOf", o.MISREGISTER_ROLES[id], now.misregisterOf(id));
  eq(id, "stChoosesTargets", o.ST_CHOOSES_TARGETS.has(id), now.stChoosesTargets(id));

  // 파생 헬퍼 — 스펙 값이 같아도 조회 경로가 어긋나면 여기서 잡힌다.
  const spec = now.actionSpec(id);
  eq(id, "playerChoosesTargets", o.playerChoosesTargets(id, spec), now.playerChoosesTargets(id, spec));
  eq(id, "showcaseVariants", o.showcaseVariants(spec), now.showcaseVariants(spec));
  for (const v of [0, 1, 2])
    eq(id, `pickShowcase(${v})`, o.pickShowcase(spec, v), now.pickShowcase(spec, v));
}

// 부수효과 플래그는 이관 전엔 lib/games/record.ts의 지역 상수였다 — 값을 직접 대조한다.
const ROLE_CHANGE = new Set(["pithag", "kazali", "lordoftyphon", "summoner"]);
const GAIN_RESULT = new Set(["philosopher"]);
for (const id of ids) {
  eq(id, "changesTargetRole", ROLE_CHANGE.has(id), now.changesTargetRole(id));
  eq(id, "gainsResultAbility", GAIN_RESULT.has(id), now.gainsResultAbility(id));
}

if (fails.length) {
  console.error(`✗ 동작 스펙 이관 불일치 ${fails.length}건 / 검사 ${checks}건\n`);
  for (const f of fails.slice(0, 40)) console.error("  " + f);
  if (fails.length > 40) console.error(`  … 외 ${fails.length - 40}건`);
  process.exit(1);
}
console.log(`✓ 동작 스펙 이관 등가 — 직업 ${ids.length}종, 검사 ${checks}건 전부 일치`);
}
