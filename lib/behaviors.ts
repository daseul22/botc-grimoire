// 직업 동작(behavior) 정의와 레지스트리 — 순수 모듈(클라이언트/서버 공용, DB 의존 없음).
//
// 이 파일이 "직업이 그리모어에서 어떻게 작동하는가"의 **단일 타입 출처**다.
// 예전엔 lib/night-actions.ts에 Record 상수로 하드코딩돼 있어서 직업을 추가하려면
// 소스를 고쳐야 했다. 이제는 3층으로 나뉜다:
//
//   1) BASE    : data/behaviors.json — 공식 133개 직업의 기본 동작(커밋된 진실, 빌드 타임 정적)
//   2) OVERLAY : 런타임 주입 — 커스텀 직업 + 공식 직업을 UI에서 수정한 분(DB에서 로드)
//   3) 폴백    : 미등재 직업은 { targets:1, result:"text" }로 자유 입력
//
// id는 전역 유니크(공식=고정 id, 커스텀=`x-` 접두 uuid)라 OVERLAY 병합은 충돌하지 않는다.
// 서버는 lib/custom-characters.ts가 DB를 읽어 install하고, 클라는 서버 컴포넌트가
// props로 내려준 맵을 useInstallBehaviors로 install한다(렌더 중 동기 — 첫 렌더부터 유효).

import raw from "@/data/behaviors.json";

// ── 행동 스펙 ──

/**
 * 기록할 결과의 종류 → 입력 위젯이 결정된다.
 * - none   : 기록할 결과 없음(지목 자체가 결과 — 살해/보호/중독/주인 지정 등)
 * - number : 숫자(공감자·요리사 등 카운트)
 * - yesno  : 예/아니오(점쟁이·꽃팔이 등)
 * - role   : 공개된 캐릭터(장의사·까마귀지기·세탁부 등) → 직업 선택
 * - team   : 선/악 진영(마을 백치 등)
 * - text   : 자유 입력(복잡/예외)
 */
export type ResultKind = "none" | "number" | "yesno" | "role" | "team" | "text";

/**
 * 결과 보여주기 화면(showcase)에 표시할 토큰 슬롯.
 * - actor    : 능력 사용자 본인 직업 토큰(세레노버스 등)
 * - actorName: 능력 사용자 닉네임 카드
 * - result   : result가 role/team일 때 그 직업/팀 토큰
 * - target   : targets[0] 좌석의 직업 토큰 (정체 노출됨)
 * - target2  : targets[1] 좌석의 직업 토큰 (정체 노출됨)
 * - targets  : 모든 targets 좌석의 직업 토큰 (정체 노출됨)
 * - name     : targets[0] 좌석의 닉네임만(직업 정체 안 노출). 점쟁이·재봉사 등.
 * - name2    : targets[1] 좌석의 닉네임만.
 * - names    : 모든 targets 좌석의 닉네임만. 귀족 3명 등.
 */
export type ShowcaseToken =
  | "actor"
  | "actorName"
  | "result"
  | "target"
  | "target2"
  | "targets"
  | "name"
  | "name2"
  | "names";

/** 특수 데이터 기반 보여주기 모드 — show 페이지가 ?mode=...으로 분기 렌더한다. */
export type ShowcaseMode =
  | "bluffs"
  | "minions"
  | "lunatic-bluffs"
  | "lunatic-minions"
  | "lunatic-choice"
  | "grimoire";

/**
 * 직업별 보여주기 메시지/토큰 구성.
 * heading/subheading placeholder: {role} {target} {target2} {targets} {actor} {result} {count} {yn} {team}
 */
export type ShowcaseSpec = {
  heading?: string;
  subheading?: string;
  tokens?: ShowcaseToken[];
  /** 토큰을 가로 한 줄 대신 세로로 쌓아 표시(토큰 → 플레이어 → 설명 순). 세탁부류 공개 카드용. */
  stack?: boolean;
  /**
   * 화면을 보는 사람.
   * - actor : 능력 사용자 본인(기본)
   * - target: 첫 지목 좌석(세레노버스/처단자)
   * - none  : 받는 사람을 화면에 표기하지 않음(꼭두각시처럼 능력 주인이 아닌 제3자에게 보여줄 때)
   */
  recipient?: "actor" | "target" | "none";
  mode?: ShowcaseMode;
};

export type ActionSpec = {
  /** 지목 가능한 좌석 수의 상한 (0~상한). 본인 좌석도 지목 가능(임프 자결 등). */
  targets: number;
  /** 기록할 결과 종류 */
  result: ResultKind;
  /** 결과로 대상에 적용 제안할 마커 id (lib/markers.ts) */
  marker?: string;
  /** 결과 입력 힌트 */
  hint?: string;
  /** 보여주기 화면 커스터마이즈. 배열이면 ?v=N으로 변형 선택(마술사 = 데몬용/하수인용). */
  showcase?: ShowcaseSpec | ShowcaseSpec[];
  /** 배열 showcase일 때 각 변형의 label(버튼 라벨) */
  showcaseLabels?: string[];
  /** 게임당 1회만 쓰는 능력(처단자·까마귀지기 등) — 기록되면 "능력 사용함" 표시. */
  oncePerGame?: boolean;
  /** 사망 시 발동하는 능력(까마귀지기) — 죽어도 비활성으로 흐리지 않는다. */
  deathTriggered?: boolean;
  /**
   * 플레이어가 폰에서 직업을 *직접 골라야* 하는 능력(철학자·도박꾼·핏쥐 등) → '직업 목록' 버튼 노출.
   * 정보로 직업을 *알게만* 되는 능력(세탁부·까마귀지기 등)은 ST가 보여주므로 목록이 필요 없다.
   */
  playerPicks?: boolean;
  /**
   * result가 INFO_KINDS(number/yesno/role/team)는 아니지만 실질은 '정보 능력'이라
   * 취함/중독/Vortox 시 거짓 정보 경고(TaintWarning) 대상인 직업(꿈꾸는 자 등 result:text 정보).
   */
  info?: boolean;
};

// ── 직업 동작 전체 ──

/**
 * 한 직업이 그리모어에서 작동하는 방식 전체.
 * 페이즈별 행동 스펙 + 운영 보조 플래그. 커스텀 직업 빌더가 이 구조를 그대로 편집한다.
 */
export type CharacterBehavior = {
  /** 밤 행동(첫밤 및 기본). 밤에 안 깨면 생략. */
  night?: ActionSpec;
  /** 그 외 밤 오버라이드 — 첫밤과 행동이 다른 직업(메제펠레스·대부 등). */
  otherNight?: ActionSpec;
  /** 낮 능력(슬레이어·처녀 등). */
  day?: ActionSpec;
  /**
   * 이야기꾼용 판정 기준 한 줄. 공식 밤 시트 문구는 "무슨 수를 줘야 하는지"가 안 적혀 있어서
   * 정보 직업의 실제 셈/선택 규칙을 보강한다. 행동 순서 사이드바가 공식 문구 아래에 표시.
   */
  criteria?: string;
  /**
   * 정보 능력의 대상이 되면 진영/직업이 반대로 '등록'될 수 있는 패시브 트랩.
   * recluse(선→악), spy(악→선). ST가 대상의 진짜 직업을 못 봐서 생기는 실수를 막는 경고용.
   */
  misregister?: "good-as-evil" | "evil-as-good";
  /**
   * 대상을 *플레이어가 아니라 이야기꾼이* 고르는 직업(세탁부류 "이 두 명 중 하나가 X",
   * 낮의 공개 선언인 슬레이어·처녀). 온라인 '대상 고르게 하기' 푸시를 띄우지 않는다.
   */
  stChoosesTargets?: boolean;
  /**
   * 결과 직업으로 *대상 좌석의 실제 직업을 바꾸는* 능력(마귀할멈·카잘리·티폰의 군주·소환사).
   * 좌석에 실제 적용하지 않으면 이후 밤 순서·정보 계산이 옛 직업 기준으로 어긋난다.
   */
  roleChange?: boolean;
  /**
   * 결과 직업의 능력을 *본인이* 획득(철학자) — gained 마커 부여 + 그 직업이 인플레이면 원본 좌석 취함.
   */
  gainResultAbility?: boolean;
  /**
   * 행동 기록이 없어도 보여주기를 노출하는 직업(마술사·꼭두각시).
   * 이들은 ST가 지목/결과를 기록하는 게 아니라 존재 자체로 정보 화면이 뜬다.
   */
  showsWithoutRecord?: boolean;
};

export type BehaviorMap = Record<string, CharacterBehavior>;

// ── 레지스트리 ──

/** 공식 기본값 — 빌드 타임 정적(클라 번들 포함). data/behaviors.json이 진실. */
const BASE = raw as BehaviorMap;

/** 런타임 오버레이 — 커스텀 직업 + 공식 직업 수정분. id 단위 통째 교체. */
let OVERLAY: BehaviorMap = {};

/** 미등재 직업(정의 없는 커스텀 등)의 폴백 — 자유 입력. */
export const FALLBACK_SPEC: ActionSpec = { targets: 1, result: "text" };

/**
 * 런타임 동작 정의를 주입한다. id 단위로 통째 교체하며 여러 번 호출하면 누적 병합된다.
 * 같은 내용을 다시 넣어도 결과가 같아(idempotent) 렌더 중 호출해도 안전하다.
 */
export function installBehaviors(map: BehaviorMap | null | undefined): void {
  if (!map) return;
  OVERLAY = { ...OVERLAY, ...map };
}

/** 주입분을 모두 비운다(테스트·시뮬 격리용). 공식 BASE는 영향 없음. */
export function resetBehaviors(): void {
  OVERLAY = {};
}

/** 직업의 동작 정의. 오버레이 우선, 없으면 공식 기본값. 미등재면 undefined. */
export function getBehavior(characterId: string): CharacterBehavior | undefined {
  return OVERLAY[characterId] ?? BASE[characterId];
}

/** 동작이 정의된 모든 직업 id(공식 + 주입분). */
export function behaviorIds(): string[] {
  return [...new Set([...Object.keys(BASE), ...Object.keys(OVERLAY)])];
}

/** 공식 기본값 그대로(오버레이 무시) — 빌더의 '기본값으로 되돌리기'·복제 시작점. */
export function baseBehavior(characterId: string): CharacterBehavior | undefined {
  return BASE[characterId];
}
