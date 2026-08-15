// 야간/낮 행동 스펙 조회 — 순수 모듈(클라이언트/서버 공용).
//
// 직업이 "누구를 지목하고 무슨 결과를 받는지"의 **정의**는 lib/behaviors.ts 레지스트리에 있고
// (공식 기본값 = data/behaviors.json, 커스텀·수정분 = 런타임 주입), 이 파일은 그 위에서
// "이 페이즈에 이 직업은 어떤 스펙인가"를 풀어주는 **조회 계층**이다.
//
// 야간 행동 여부/순서는 Character.firstNight/otherNight(데이터)가 정하고,
// 여기서는 그 행동의 입력(지목 수)과 결과(기록 종류)를 결정한다.
//
// 결과는 종류와 무관하게 문자열로 저장한다:
//   number→"2", yesno→"yes"/"no", role→characterId, team→"good"/"evil", text→원문.

import {
  FALLBACK_SPEC,
  getBehavior,
  type ActionSpec,
  type ResultKind,
  type ShowcaseSpec,
} from "./behaviors";
import type { Character } from "./types";

// 타입은 behaviors.ts가 단일 출처. 기존 import 경로를 깨지 않도록 여기서 재수출한다.
export type {
  ActionSpec,
  CharacterBehavior,
  ResultKind,
  ShowcaseMode,
  ShowcaseSpec,
  ShowcaseToken,
} from "./behaviors";

export const RESULT_KIND_LABEL: Record<ResultKind, string> = {
  none: "결과 없음",
  number: "숫자",
  yesno: "예/아니오",
  role: "직업",
  team: "진영",
  text: "메모",
};

/** 결과가 "정보"인 종류 — 취함/중독이면 거짓 정보 경고 대상. */
export const INFO_KINDS: ReadonlySet<ResultKind> = new Set<ResultKind>([
  "number",
  "yesno",
  "role",
  "team",
]);

// ── 오등록(misregister) 트랩 ──

/**
 * 정보 능력의 대상이 되면 진영/직업이 반대로 "등록"될 수 있는 패시브 트랩인지.
 * 폰으로 운영하는 ST가 대상의 진짜 직업을 못 봐서 점쟁이가 은둔자를 선으로 알려주는 식의 실수를 막는다.
 *   good-as-evil(은둔자) → 악(하수인·악마)으로 보일 수 있음.
 *   evil-as-good(첩자)   → 선(주민·외지인)으로 보일 수 있음.
 */
export function misregisterOf(characterId: string): "good-as-evil" | "evil-as-good" | undefined {
  return getBehavior(characterId)?.misregister;
}

export function misregisterWarn(characterId: string): string | undefined {
  const k = misregisterOf(characterId);
  if (k === "good-as-evil") return "은둔자 — 악(하수인·악마)으로 보일 수 있음";
  if (k === "evil-as-good") return "첩자 — 선(주민·외지인)으로 보일 수 있음";
  return undefined;
}

/**
 * 정보 능력의 대상 좌석이 '반대로 등록'돼 ST가 실수하기 쉬운 경우의 경고.
 * - 직업 기반(은둔자/첩자): 모든 정보 능력에 공통(misregisterWarn).
 * - 레드헤링(herring 마커): *점쟁이에게만* 악마(악)으로 등록되므로 actor가 점쟁이일 때만.
 * 호출측이 정보 능력(INFO_KINDS)인지 이미 가린다.
 */
export function infoTargetWarn(
  target: { characterId: string; markers: string[] },
  actorCharacterId?: string,
): string | undefined {
  if (actorCharacterId === "fortuneteller" && target.markers.includes("herring"))
    return "레드헤링 — 점쟁이에게 악마(악)으로 보임";
  return misregisterWarn(target.characterId);
}

// ── 스펙 조회 ──

/** 직업의 밤 행동 스펙(첫밤 기준). 미등재(정의 없는 커스텀)는 자유 입력으로 폴백. */
export function actionSpec(characterId: string): ActionSpec {
  return getBehavior(characterId)?.night ?? FALLBACK_SPEC;
}

/** 밤 행동 스펙 — 그 외 밤에 행동이 달라지는 직업(메제펠레스 등) 반영. */
export function nightActionSpec(characterId: string, isFirstNight: boolean): ActionSpec {
  const b = getBehavior(characterId);
  if (!isFirstNight && b?.otherNight) return b.otherNight;
  return b?.night ?? FALLBACK_SPEC;
}

/** 낮 능력 스펙. 낮 능력 없으면 undefined. */
export function dayActionSpec(characterId: string): ActionSpec | undefined {
  return getBehavior(characterId)?.day;
}

/** 페이즈에 맞는 스펙. 복기 등에서 기록을 해석할 때 사용. day 생략 시 첫밤 기준. */
export function specForPhase(characterId: string, phase: string, day?: number): ActionSpec {
  if (phase === "day") return getBehavior(characterId)?.day ?? actionSpec(characterId);
  return nightActionSpec(characterId, day === undefined || day === 1);
}

/** 게임당 1회 능력(밤·낮 어디든)인지. 사용 시 'noability' 마커 자동 부여 판정용. */
export function isOncePerGame(characterId: string): boolean {
  const b = getBehavior(characterId);
  return !!(b?.night?.oncePerGame || b?.day?.oncePerGame || b?.otherNight?.oncePerGame);
}

/**
 * 일회성 능력이 이미 소진됐는지 — 'noability:<직업>' 영구 마커로 판정(구버전 bare 'noability' 호환).
 * 한 좌석에 여러 일회성 능력(철학자+획득직업 등)이 있어도 해당 직업 마커만 본다.
 */
export function isAbilityUsedUp(
  oncePerGame: boolean | undefined,
  characterId: string,
  markers: string[],
): boolean {
  return !!oncePerGame && markers.some((m) => m === "noability" || m === `noability:${characterId}`);
}

/**
 * 이야기꾼용 판정 기준 한 줄. 공식 밤 시트 문구("손가락을 펴서 신호를 줍니다" 등)는 무슨 수를
 * 줘야 하는지 안 적혀 있어서, 정보 직업의 실제 셈/선택 규칙을 보강한다.
 * 행동 순서 사이드바가 공식 문구 아래에 별도 줄로 표시(effId 기준).
 */
export function actionCriteria(characterId: string): string | undefined {
  return getBehavior(characterId)?.criteria;
}

// ── 보여주기(showcase) 변형 해석 — 단일 출처 ──
// spec.showcase는 단일/배열/없음 3형태라, 정규화·변형선택 규칙이 여러 곳(show 페이지·행동 순서 행·
// 능력 미리보기)에서 손으로 복제되면 한쪽만 바뀌어 어긋난다. 아래 두 헬퍼로 단일화한다.

/** spec.showcase를 항상 배열로 정규화 — 단일=[1개], 없음=[]. 변형 버튼/개수 계산용. */
export function showcaseVariants(spec: ActionSpec): ShowcaseSpec[] {
  const raw = spec.showcase;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

/** variant 인덱스로 보여주기 변형 1개 선택(0~length-1로 클램프). 정의 없으면 undefined. */
export function pickShowcase(spec: ActionSpec, variant = 0): ShowcaseSpec | undefined {
  const arr = showcaseVariants(spec);
  if (arr.length === 0) return undefined;
  return arr[Math.min(Math.max(0, variant | 0), arr.length - 1)];
}

/** record 없이도 보여주기를 노출하는 직업(마술사·꼭두각시) — show 페이지 emptyAllowed 판정. */
export function showsWithoutRecord(characterId: string): boolean {
  return !!getBehavior(characterId)?.showsWithoutRecord;
}

// ── 대상 선택 주체 ──

/**
 * 대상을 *플레이어가 아니라 이야기꾼이* 고르는 정보 직업 — 세탁부·조사자류("이 두 명 중 하나가 X").
 * 이들은 ST가 가리킬 좌석을 정하고 직접 기록하므로 '대상 고르게 하기'(플레이어 선택 요청)를 띄우지 않는다.
 * 낮의 슬레이어·처녀도 마찬가지: 능력 발동을 *공개적으로 선언*하므로 ST가 선언된 대상을 직접 기록한다.
 */
export function stChoosesTargets(characterId: string): boolean {
  return !!getBehavior(characterId)?.stChoosesTargets;
}

/**
 * targets를 *플레이어가 직접* 고를 능력인지 — 킬/보호/독/저주(대개 result:none) + 자기정보 선택(점쟁이·까마귀지기 등).
 * playerPicks(직업 선택)와 ST가 대상을 정하는 정보 직업은 제외한다.
 * 온라인 순서 패널이 '대상 고르게 하기'(pick-players push)를 띄울지 판정하는 단일 출처.
 */
export function playerChoosesTargets(characterId: string, spec: ActionSpec): boolean {
  return spec.targets >= 1 && !spec.playerPicks && !stChoosesTargets(characterId);
}

// ── 기록 부수효과 ──

/**
 * 결과 직업으로 *대상 좌석의 실제 직업을 바꾸는* 능력인지(마귀할멈·카잘리·티폰의 군주·소환사).
 * 좌석에 실제 적용하지 않으면 이후 밤 순서·정보 계산이 옛 직업 기준으로 어긋난다.
 */
export function changesTargetRole(characterId: string): boolean {
  return !!getBehavior(characterId)?.roleChange;
}

/** 결과 직업의 능력을 *본인이* 획득하는 능력인지(철학자) — gained 마커 + 원본 좌석 취함. */
export function gainsResultAbility(characterId: string): boolean {
  return !!getBehavior(characterId)?.gainResultAbility;
}

// ── 값 포맷 ──

/** 마커 적용 시 실제 저장 문자열. mad는 결과(직업)를 파라미터로 결합. */
export function markerForAction(marker: string, result: string): string {
  return marker === "mad" && result ? `mad:${result}` : marker;
}

/** 결과 문자열을 사람이 읽는 형태로. role은 charMap으로 직업명 변환. */
export function formatResult(
  kind: ResultKind,
  value: string,
  charMap: Record<string, Character>,
): string {
  if (!value) return "";
  switch (kind) {
    case "yesno":
      return value === "yes" ? "예" : "아니오";
    case "team":
      return value === "good" ? "선" : value === "evil" ? "악" : value;
    case "role":
      return charMap[value]?.name.ko ?? value;
    default:
      return value;
  }
}
