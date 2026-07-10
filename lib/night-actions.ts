// 야간 행동 스펙 — 순수 모듈(클라이언트/서버 공용).
//
// 직업이 밤에 "누구를 지목하고 무슨 결과를 받는지"를 직업별로 구조화한 표.
// 야간 행동 여부/순서는 Character.firstNight/otherNight(데이터)가 정하고,
// 여기서는 그 행동의 입력(지목 수)과 결과(기록 종류)를 정의한다.
//
// targets : 지목할 수 있는 좌석 수의 "상한". 0~상한 사이로 자유 선택(보통 정확히 그 수).
// result  : 기록할 결과의 종류 → 입력 위젯이 결정된다.
//   - none   : 기록할 결과 없음(지목 자체가 결과 — 살해/보호/중독/주인 지정 등)
//   - number : 숫자(공감자·요리사 등 카운트)
//   - yesno  : 예/아니오(점쟁이·꽃팔이 등)
//   - role   : 공개된 캐릭터(장의사·까마귀지기·세탁부 등) → 직업 선택
//   - team   : 선/악 진영(마을 백치 등)
//   - text   : 자유 입력(복잡/예외)
// marker  : 결과로 대상에 적용을 "제안"할 마커 id(lib/markers.ts). 자동 아님(원클릭).
//
// 결과는 종류와 무관하게 문자열로 저장한다:
//   number→"2", yesno→"yes"/"no", role→characterId, team→"good"/"evil", text→원문.

import type { Character } from "./types";

export type ResultKind = "none" | "number" | "yesno" | "role" | "team" | "text";

/**
 * 결과 보여주기 화면(showcase)에 표시할 토큰 슬롯.
 * - actor   : 능력 사용자 본인 직업 토큰(세레노버스 등)
 * - result  : result가 role/team일 때 그 직업/팀 토큰
 * - target  : targets[0] 좌석의 직업 토큰 (정체 노출됨)
 * - target2 : targets[1] 좌석의 직업 토큰 (정체 노출됨)
 * - targets : 모든 targets 좌석의 직업 토큰 (정체 노출됨)
 * - name    : targets[0] 좌석의 닉네임만(직업 정체 안 노출). 점쟁이·재봉사 등.
 * - name2   : targets[1] 좌석의 닉네임만.
 * - names   : 모든 targets 좌석의 닉네임만. 귀족 3명 등.
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

/**
 * 직업별 보여주기 메시지/토큰 구성.
 * - heading    : 받는 사람용 큰 메시지 템플릿. placeholder: {role} {target} {target2} {targets} {actor} {result} {count} {yn} {team}
 * - subheading : 부가 설명(작게)
 * - tokens     : 표시할 토큰 슬롯 순서
 * - recipient  : 화면을 보는 사람("actor" 기본, 세레노버스/처단자 등은 "target")
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
  /**
   * 특수 데이터 기반 보여주기 모드.
   * - bluffs         : 게임의 블러핑 3개 직업 토큰(데몬용).
   * - minions        : 하수인 좌석 닉네임 + 마술사 닉네임(데몬용).
   * - lunatic-bluffs : 미치광이용 *가짜* 블러핑(game.lunaticBluffs).
   * - lunatic-minions: 미치광이용 *가짜* 하수인 좌석(game.lunaticMinions).
   * - lunatic-choice : 미치광이의 가짜 공격 지목을 *진짜 데몬*에게 보여주기.
   * - grimoire       : 마도서 전체(모든 좌석 실제 직업·진영·마커·생사) — 첩자·과부 등.
   * show 페이지가 ?mode=...으로 분기 렌더한다.
   */
  mode?: "bluffs" | "minions" | "lunatic-bluffs" | "lunatic-minions" | "lunatic-choice" | "grimoire";
};

export type ActionSpec = {
  /** 지목 가능한 좌석 수의 상한 (0~상한) */
  targets: number;
  /** 기록할 결과 종류 */
  result: ResultKind;
  /** 결과로 대상에 적용 제안할 마커 id */
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
};

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

/**
 * 정보 능력의 대상이 되면 진영/직업이 반대로 "등록"될 수 있는 패시브 트랩 직업.
 * 폰으로 운영하는 ST가 대상의 진짜 직업을 못 봐서 점쟁이가 은둔자를 선으로 알려주는 식의 실수를 막는다.
 *   recluse(은둔자, 선) → 악(하수인·악마)으로 보일 수 있음.
 *   spy(첩자, 악) → 선(주민·외지인)으로 보일 수 있음.
 * 별도 데이터 플래그가 없어 명시 목록으로 관리(능력문 자동검출은 legion 등 오탐이 많음).
 */
export const MISREGISTER_ROLES: Record<string, "good-as-evil" | "evil-as-good"> = {
  recluse: "good-as-evil",
  spy: "evil-as-good",
};
export function misregisterWarn(characterId: string): string | undefined {
  const k = MISREGISTER_ROLES[characterId];
  if (k === "good-as-evil") return "은둔자 — 악(하수인·악마)으로 보일 수 있음";
  if (k === "evil-as-good") return "첩자 — 선(주민·외지인)으로 보일 수 있음";
  return undefined;
}

/**
 * 정보 능력의 대상 좌석이 '반대로 등록'돼 ST가 실수하기 쉬운 경우의 경고.
 * - 직업 기반(은둔자/첩자): 모든 정보 능력에 공통(misregisterWarn).
 * - 레드헤링(herring 마커): *점쟁이에게만* 데몬(악)으로 등록되므로 actor가 점쟁이일 때만.
 * 호출측이 정보 능력(INFO_KINDS)인지 이미 가린다.
 */
export function infoTargetWarn(
  target: { characterId: string; markers: string[] },
  actorCharacterId?: string,
): string | undefined {
  if (actorCharacterId === "fortuneteller" && target.markers.includes("herring"))
    return "레드헤링 — 점쟁이에게 데몬(악)으로 보임";
  return misregisterWarn(target.characterId);
}

// 직업별 스펙. 야간 행동이 있는 직업만 등재(없으면 기본값으로 처리).
export const ACTION_SPECS: Record<string, ActionSpec> = {
  // ── 트러블 브루잉 ──
  bureaucrat: { targets: 1, result: "none" },
  thief: { targets: 1, result: "none" },
  monk: { targets: 1, result: "none", marker: "protected" },
  poisoner: { targets: 1, result: "none", marker: "poisoned" },
  scarletwoman: { targets: 0, result: "none" },
  imp: { targets: 1, result: "none", marker: "dying" },
  washerwoman: { targets: 2, result: "role", hint: "둘 중 1명의 주민 직업", showcase: { heading: "이 두 명 중 한 명은 {role}입니다", tokens: ["result", "names"], stack: true } },
  librarian: { targets: 2, result: "role", hint: "둘 중 1명의 외지인(없으면 비움)", showcase: { heading: "이 두 명 중 한 명은 {role}입니다", subheading: "외지인이 없다면 결과가 비어 있습니다", tokens: ["result", "names"], stack: true } },
  investigator: { targets: 2, result: "role", hint: "둘 중 1명의 하수인 직업", showcase: { heading: "이 두 명 중 한 명은 {role}입니다", tokens: ["result", "names"], stack: true } },
  chef: { targets: 0, result: "number", hint: "이웃한 악 쌍 수", showcase: { heading: "{count}쌍이 인접해 있습니다", subheading: "악 진영끼리 이웃한 쌍의 수" } },
  empath: { targets: 0, result: "number", hint: "이웃 2명 중 악 수 (0~2)", showcase: { heading: "양 옆 이웃 중 {count}명이 악입니다" } },
  fortuneteller: { targets: 2, result: "yesno", hint: "둘 중 악마 있는가", showcase: { heading: "이 두 명 중 데몬이 있는가: {yn}", tokens: ["name", "name2"] } },
  butler: { targets: 1, result: "none" },
  // 첩자: 매일 밤 마도서(그리모어) 전체를 본다 → 보여주기로 플레이어 폰에 전체 보드를 push.
  spy: { targets: 0, result: "none", showcase: { mode: "grimoire" } },
  ravenkeeper: { targets: 1, result: "role", oncePerGame: true, deathTriggered: true, hint: "지목한 플레이어 직업", showcase: { heading: "이 사람의 직업입니다", tokens: ["result", "name"], stack: true } },
  undertaker: { targets: 0, result: "role", hint: "처형된 플레이어 직업", showcase: { heading: "오늘 처형된 사람의 직업은 {role}입니다", tokens: ["result"] } },

  // ── 배드 문 라이징 ──
  apprentice: { targets: 0, result: "role", hint: "얻은 능력", showcase: { heading: "당신은 {role}의 능력을 얻었습니다", subheading: "기존 능력 대신 이 직업처럼 행동합니다", tokens: ["result"] } },
  innkeeper: { targets: 2, result: "none", marker: "protected", hint: "둘 보호, 1명 취함" },
  gambler: { targets: 1, result: "role", playerPicks: true, hint: "추측한 직업" },
  // 미치광이: 지목 절차 X. ST가 lunatic_bluffs/lunatic_minions를 별도 지정하고
  // show 페이지 ?mode=lunatic-bluffs|lunatic-minions 분기로 가짜 정보를 미치광이에게 보여준다.
  lunatic: {
    targets: 0,
    result: "none",
    showcase: [
      { mode: "lunatic-bluffs" },
      { mode: "lunatic-minions" },
    ],
    showcaseLabels: ["블러핑", "하수인"],
  },
  sailor: { targets: 1, result: "none", marker: "drunk-dusk" },
  courtier: { targets: 1, result: "none", marker: "drunk", hint: "3일 밤낮 취함" },
  exorcist: { targets: 1, result: "none", showcase: { recipient: "none", heading: "구마사제가 당신을 선택했습니다", subheading: "당신(악마)은 오늘 밤 깨지 않습니다", tokens: ["actor", "actorName"], stack: true } },
  godfather: { targets: 0, result: "none", hint: "게임에 있는 외지인 토큰을 보여줌" },
  devilsadvocate: { targets: 1, result: "none", marker: "protected", hint: "처형 생존" },
  zombuul: { targets: 1, result: "none", marker: "dying" },
  shabaloth: { targets: 2, result: "none", marker: "dying" },
  po: { targets: 3, result: "none", marker: "dying", hint: "1명 또는 3명" },
  pukka: { targets: 1, result: "none", marker: "poisoned" },
  assassin: { targets: 1, result: "none", marker: "dying", oncePerGame: true },
  grandmother: { targets: 1, result: "role", hint: "알게 된 선한 플레이어 직업", showcase: { heading: "이 사람은 {role}입니다", subheading: "당신의 손주입니다", tokens: ["result", "name"], stack: true } },
  gossip: { targets: 1, result: "none", marker: "dying" },
  professor: { targets: 1, result: "none", oncePerGame: true, hint: "부활 대상" },
  tinker: { targets: 0, result: "none" },
  moonchild: { targets: 1, result: "none", marker: "dying" },
  chambermaid: { targets: 2, result: "number", hint: "능력으로 깬 수 (0~2)", showcase: { heading: "이 두 명 중 {count}명이 자기 능력으로 깼습니다", tokens: ["name", "name2"] } },

  // ── 종파의 제비꽃 ──
  harlot: { targets: 1, result: "role", hint: "지목한 플레이어 직업", showcase: { heading: "이 사람은 {role}입니다", tokens: ["result", "name"], stack: true } },
  barista: { targets: 1, result: "none" },
  bonecollector: { targets: 1, result: "none", hint: "능력 되찾을 사망자" },
  philosopher: { targets: 0, result: "role", oncePerGame: true, playerPicks: true, hint: "얻은 선한 직업", showcase: { heading: "당신은 {role}의 능력을 얻었습니다", subheading: "기존 능력 대신 이 직업처럼 행동합니다", tokens: ["result"] } },
  pithag: { targets: 1, result: "role", playerPicks: true, hint: "바꿀 직업", showcase: { recipient: "target", heading: "당신은 이제 {role}입니다", subheading: "마귀할멈에 의해 이 캐릭터로 바뀌었습니다", tokens: ["result"] } },
  snakecharmer: { targets: 1, result: "none" },
  eviltwin: { targets: 0, result: "none" },
  witch: { targets: 1, result: "none", hint: "저주: 지목하면 사망" },
  cerenovus: { targets: 1, result: "role", marker: "mad", playerPicks: true, hint: "집착시킬 선한 직업", showcase: { recipient: "target", heading: "당신은 {role}에 집착해야 합니다", subheading: "그 직업이 아닌 척하면 이야기꾼이 처형할 수 있습니다", tokens: ["actor", "result"] } },
  fanggu: { targets: 1, result: "none", marker: "dying" },
  nodashii: { targets: 1, result: "none", marker: "dying", hint: "이웃 주민 2명 중독" },
  vortox: { targets: 1, result: "none", marker: "dying" },
  vigormortis: { targets: 1, result: "none", marker: "dying" },
  clockmaker: { targets: 0, result: "number", hint: "악마-하수인 거리", showcase: { heading: "악마와 가장 가까운 하수인 사이의 거리: {count}", subheading: "시계/반시계 중 짧은 쪽 걸음 수" } },
  dreamer: { targets: 1, result: "text", hint: "선 직업 / 악 직업", showcase: { heading: "이 사람은 둘 중 하나입니다", subheading: "선한 직업 또는 악한 직업", tokens: ["name"] } },
  barber: { targets: 0, result: "none" },
  seamstress: { targets: 2, result: "yesno", oncePerGame: true, hint: "둘이 같은 소속인가", showcase: { heading: "두 사람이 같은 진영인가: {yn}", tokens: ["name", "name2"] } },
  sweetheart: { targets: 1, result: "none", marker: "drunk" },
  sage: { targets: 2, result: "none", deathTriggered: true, hint: "둘 중 1명이 악마", showcase: { heading: "이 두 명 중 한 명이 악마입니다", tokens: ["names"] } },
  mathematician: { targets: 0, result: "number", hint: "비정상 작동 능력 수", showcase: { heading: "비정상적으로 작동한 능력: {count}개", subheading: "다른 플레이어의 능력으로 오작동한 수" } },
  flowergirl: { targets: 0, result: "yesno", hint: "악마가 투표했는가", showcase: { heading: "오늘 낮 악마가 투표했는가: {yn}" } },
  towncrier: { targets: 0, result: "yesno", hint: "하수인이 지목했는가", showcase: { heading: "오늘 낮 하수인이 지목에 나섰는가: {yn}" } },
  oracle: { targets: 0, result: "number", hint: "사망자 중 악 수", showcase: { heading: "사망자 중 {count}명이 악입니다" } },
  juggler: { targets: 0, result: "number", hint: "맞힌 추측 수", showcase: { heading: "오늘 낮 추측 중 {count}개를 맞혔습니다" } },

  // ── 기타/실험 직업 ──
  princess: { targets: 0, result: "none" },
  noble: { targets: 3, result: "none", hint: "3명 중 1명만 악", showcase: { heading: "이 세 명 중 정확히 한 명이 악입니다", tokens: ["names"] } },
  engineer: { targets: 0, result: "text", oncePerGame: true, hint: "지정한 악역 구성" },
  knight: { targets: 2, result: "none", hint: "악마 아닌 2명", showcase: { heading: "이 두 명은 악마가 아닙니다", tokens: ["names"] } },
  amnesiac: { targets: 0, result: "text" },
  acrobat: { targets: 1, result: "none" },
  farmer: { targets: 1, result: "none" },
  lycanthrope: { targets: 1, result: "none", marker: "dying" },
  highpriestess: { targets: 1, result: "none", showcase: { heading: "이 사람과 가장 많이 이야기해보세요", tokens: ["name"] } },
  // 마술사: 자체 보여주기 X. 데몬/하수인 정보 단계에 자동 포함되어 노출된다.
  // (show 페이지 ?mode=bluffs/minions가 인플레이 마술사 닉네임을 함께 표시.)
  magician: { targets: 0, result: "none" },
  villageidiot: { targets: 1, result: "team", hint: "대상의 팀", showcase: { heading: "이 사람은 {team}입니다", tokens: ["name"] } },
  banshee: { targets: 0, result: "none" },
  cultleader: { targets: 0, result: "team", hint: "현재 내 팀", showcase: { heading: "당신은 현재 {team} 팀입니다" } },
  huntsman: { targets: 1, result: "none", oncePerGame: true },
  choirboy: { targets: 1, result: "none", showcase: { heading: "이 사람이 악마입니다", tokens: ["target"] } },
  shugenja: { targets: 0, result: "text", hint: "시계/반시계 방향", showcase: { heading: "가장 가까운 악은 {result} 방향에 있습니다" } },
  steward: { targets: 1, result: "none", hint: "선한 플레이어", showcase: { heading: "이 사람은 선합니다", tokens: ["name"] } },
  nightwatchman: { targets: 1, result: "none", oncePerGame: true, showcase: { recipient: "target", heading: "이 사람은 야경꾼입니다", subheading: "야경꾼이 자신의 정체를 당신에게 밝혔습니다", tokens: ["actor", "actorName"], stack: true } },
  poppygrower: { targets: 0, result: "none" },
  alchemist: { targets: 0, result: "text", hint: "가진 하수인 능력" },
  balloonist: { targets: 1, result: "role", hint: "알게 된 플레이어 직업", showcase: { heading: "이 사람은 {role}입니다", tokens: ["result", "name"], stack: true } },
  king: { targets: 0, result: "role", hint: "알게 된 생존 직업", showcase: { heading: "이 직업이 아직 살아 있습니다", tokens: ["result"] } },
  general: { targets: 0, result: "text", hint: "우세 팀(선/악/없음)", showcase: { heading: "오늘 우세한 진영: {result}" } },
  preacher: { targets: 1, result: "none", showcase: { recipient: "target", heading: "전도사가 당신을 선택했습니다", subheading: "당신은 능력을 잃습니다", tokens: ["actor"] } },
  pixie: { targets: 0, result: "role", hint: "집착할 주민 직업", showcase: { heading: "당신은 {role}에 집착해야 합니다", subheading: "집착에 성공했을 때, 그 사람이 죽으면 그의 능력을 얻습니다", tokens: ["result"] } },
  bountyhunter: { targets: 1, result: "none", hint: "악한 플레이어", showcase: { heading: "이 사람은 악입니다", tokens: ["name"] } },
  hatter: { targets: 0, result: "none" },
  snitch: { targets: 0, result: "none" },
  damsel: { targets: 0, result: "none" },
  plaguedoctor: { targets: 0, result: "none" },
  ogre: { targets: 1, result: "none" },
  organgrinder: { targets: 0, result: "none", marker: "drunk-dusk" },
  fearmonger: { targets: 1, result: "none" },
  boffin: { targets: 0, result: "role", hint: "악마가 얻은 선한 능력", showcase: { heading: "악마가 얻은 능력: {role}", tokens: ["result"] } },
  // 꼭두각시는 데몬에게 town으로 보이지만 실제로 evil. 데몬에게 두 가지 방식으로 알려준다.
  // 정확: "{actor}이 꼭두각시" / 모호: "이웃 중 한 명이 꼭두각시" (좌석은 안 알려줌)
  // recipient: none — 데몬에게 보여주는 화면이라 "꼭두각시 본인 닉네임 님께" 안내는 안 띄움.
  marionette: {
    targets: 0,
    result: "none",
    showcase: [
      { heading: "이 사람은 꼭두각시입니다", subheading: "마을사람으로 보이지만 실제로는 악입니다", tokens: ["actor", "actorName"], stack: true, recipient: "none" },
      { heading: "이웃 중 한 명이 꼭두각시입니다", subheading: "양 옆 두 명 중 한 명이 꼭두각시(가짜 마을사람·악)입니다", tokens: ["actor"], recipient: "none" },
    ],
    showcaseLabels: ["정확", "이웃"],
  },
  wizard: { targets: 0, result: "text", hint: "소원/결과" },
  // ST가 메제펠리스에게 비밀 단어를 알려주고, 누군가 그 단어를 말하면 변절(turning) 처리.
  // result=text로 단어를 입력해 두면 show 페이지에서 큰 글자로 보여줄 수 있다.
  mezepheles: { targets: 0, result: "text", hint: "비밀 단어", showcase: { heading: "당신의 비밀 단어:", subheading: "이 단어를 누가 말하면 그 사람이 악으로 변절합니다", } },
  widow: { targets: 1, result: "none", marker: "poisoned" },
  summoner: { targets: 0, result: "none", hint: "블러핑 직업 3개를 ST가 보여줌" },
  wraith: { targets: 0, result: "none" },
  xaan: { targets: 0, result: "none", hint: "모든 주민 중독" },
  vizier: { targets: 0, result: "none" },
  harpy: { targets: 2, result: "none", marker: "mad", hint: "1번이 2번을 악으로 집착", showcase: { recipient: "target", heading: "당신은 {target2}이(가) 악이라는 사실에 집착해야 합니다", subheading: "그 직업이 아닌 척하면 이야기꾼이 처형할 수 있습니다", tokens: ["name2"] } },
  lleech: { targets: 1, result: "none", marker: "dying" },
  legion: { targets: 1, result: "none", marker: "dying" },
  leviathan: { targets: 0, result: "none" },
  lilmonsta: { targets: 1, result: "none", marker: "dying", showcase: { recipient: "target", heading: "당신은 악마입니다", subheading: "릴 몬스타를 돌보는 동안 당신이 데몬으로 취급됩니다", tokens: ["name"] } },
  alhadikhia: { targets: 3, result: "none", marker: "dying", showcase: { heading: "이 세 명이 선택되었습니다", subheading: "각자 순서대로 생존/사망을 선택합니다 (모두 생존 시 모두 사망)", tokens: ["names"] } },
  yaggababble: { targets: 0, result: "text", hint: "비밀 문구", showcase: { heading: "당신의 비밀 문구:", subheading: "오늘 이를 공개 발언한 횟수만큼 플레이어가 사망할 수 있습니다" } },
  ojo: { targets: 1, result: "role", marker: "dying", hint: "선택한 캐릭터 (없으면 ST가 사망자 선택)" },
  kazali: { targets: 1, result: "role", playerPicks: true, hint: "새 하수인이 될 직업", showcase: { recipient: "target", heading: "당신은 이제 하수인입니다", subheading: "카잘리가 당신을 하수인으로 만들었습니다", tokens: ["result"] } },
  lordoftyphon: { targets: 1, result: "role", playerPicks: true, hint: "이웃이 될 하수인 직업", showcase: { recipient: "target", heading: "당신은 이제 하수인입니다", subheading: "티폰의 군주의 이웃으로 악 진영이 되었습니다", tokens: ["result"] } },
  riot: { targets: 0, result: "none" },
  cacklejack: { targets: 1, result: "none", showcase: { recipient: "target", heading: "당신의 캐릭터가 바뀌었습니다", subheading: "낄낄이가 당신을 새 캐릭터로 바꿨습니다" } },
  duchess: { targets: 3, result: "number", hint: "방문자 중 악 수", showcase: { recipient: "none", heading: "방문자 중 악은 {count}명입니다", subheading: "세 방문자 중 한 명에게는 거짓으로 알려줍니다", tokens: ["names"] } },
  buddhist: { targets: 0, result: "none" },
  toymaker: { targets: 0, result: "none" },
  angel: { targets: 1, result: "none", marker: "protected", hint: "천사가 보호하는 플레이어" },

  // ── 설화(로릭) ──
  tor: { targets: 0, result: "none" },
  stormcatcher: { targets: 0, result: "role", playerPicks: true, hint: "이름 댄 선한 직업" },
};

// 낮에 사용하는 능력. 야간순서에 없고 낮에 발동하는 직업만 등재.
// (곡예사·험담꾼처럼 밤/낮 둘 다 있는 직업은 양쪽에 등재 — 페이즈별로 따로 기록됨)
export const DAY_ACTION_SPECS: Record<string, ActionSpec> = {
  // ── 트러블 브루잉 ──
  slayer: { targets: 1, result: "yesno", marker: "dying", oncePerGame: true, hint: "악마 적중?", showcase: { recipient: "none", heading: "이 사람이 악마였는가: {yn}", subheading: "악마였다면 사망합니다", tokens: ["name"] } },
  virgin: { targets: 1, result: "yesno", marker: "dying", oncePerGame: true, hint: "지목자 주민→처형?", showcase: { recipient: "none", heading: "지목한 사람이 마을주민이라 처형되는가: {yn}", tokens: ["name"] } },
  gunslinger: { targets: 1, result: "none", marker: "dying" },

  // ── 배드 문 라이징 ──
  gossip: { targets: 0, result: "text", hint: "공개 발언" },

  // ── 종파의 제비꽃 ──
  juggler: { targets: 0, result: "text", hint: "추측 (최대 5)" },
  savant: { targets: 0, result: "text", hint: "정보 2 (1참 1거짓)" },
  artist: { targets: 0, result: "yesno", oncePerGame: true, hint: "예/아니오 질문 답", showcase: { heading: "당신의 질문에 대한 답: {yn}" } },
  klutz: { targets: 1, result: "none", hint: "악이면 팀 패배" },

  // ── 기타/실험 직업 ──
  princess: { targets: 1, result: "none", hint: "지목·처형" },
  amnesiac: { targets: 0, result: "text", hint: "능력 추측 정확도" },
  fisherman: { targets: 0, result: "text", oncePerGame: true, hint: "조언" },
  alsaahir: { targets: 0, result: "text", hint: "하수인·악마 추측" },
  puzzlemaster: { targets: 1, result: "role", hint: "취한 자 추측→악마" },
  psychopath: { targets: 1, result: "none", marker: "dying" },
  gangster: { targets: 1, result: "none", marker: "dying" },
  golem: { targets: 1, result: "none", marker: "dying", oncePerGame: true, hint: "악마 아니면 사망" },
};

// 첫째 밤과 그 외 밤의 행동이 다른 직업 — 그 외 밤에만 이 스펙으로 오버라이드.
export const OTHER_NIGHT_SPECS: Record<string, ActionSpec> = {
  // 메제펠레스: 첫밤=비밀 단어 전달(text), 그 외 밤=단어를 말한 선한 플레이어 1명을 변절 처리.
  // 보여주기는 변절된 본인에게(recipient=target).
  mezepheles: {
    targets: 1,
    result: "none",
    marker: "turning",
    hint: "비밀 단어를 말한 변절자",
    showcase: {
      recipient: "target",
      heading: "당신은 메제펠레스에 의해 변절되었습니다",
      subheading: "지금부터 당신은 악 진영입니다",
      tokens: ["actor"],
    },
  },
  // 첫밤=정보, 그 외 밤=살해/변신인 직업 — 그 외 밤 스펙을 분리(첫밤은 ACTION_SPECS).
  godfather: { targets: 1, result: "none", marker: "dying", hint: "낮에 외지인이 죽었으면 1명 살해" },
  yaggababble: { targets: 1, result: "none", marker: "dying", hint: "발언 횟수만큼 사망" },
  kazali: { targets: 1, result: "none", marker: "dying" },
  lordoftyphon: { targets: 1, result: "none", marker: "dying" },
  // 할머니: 그 외 밤은 '손주가 밤에 죽으면 할머니도 사망'(순수 패시브) — 입력 위젯 없이 reminder만.
  grandmother: { targets: 0, result: "none" },
  // 소환사: 3일차 밤 1명을 악마로 만들고(대상 좌석이 실제로 그 악마 직업이 됨) 그 대상에게 통보.
  summoner: { targets: 1, result: "role", playerPicks: true, hint: "악마가 될 대상·직업", showcase: { recipient: "target", heading: "당신은 이제 악마입니다", subheading: "소환사가 당신을 악마로 만들었습니다", tokens: ["result"] } },
};

/**
 * 이야기꾼용 판정 기준. 공식 밤 시트 문구("손가락을 펴서 신호를 줍니다" 등)는 무슨 수를
 * 줘야 하는지 안 적혀 있어서, 정보 직업의 실제 셈/선택 규칙을 한 줄로 보강한다.
 * 행동 순서 사이드바에서 공식 문구 아래에 별도 줄로 표시(effId 기준).
 */
export const ACTION_CRITERIA: Record<string, string> = {
  // ── 트러블 브루잉 ──
  chef: "인접한 악(데몬+하수인) 쌍의 수. 원탁에서 악끼리 나란히 앉은 경우를 셈 — 악이 N명 연속이면 N−1쌍.",
  empath: "양옆에서 가장 가까운 생존 플레이어 중 악(데몬+하수인) 수(0~2). 죽은 사람은 건너뛴다.",
  fortuneteller: "고른 2명 중 데몬 또는 레드헤링이 있으면 '예'(끄덕). 스파이는 선, 레크루스는 악으로 등록될 수 있음.",
  washerwoman: "인플레이 주민 1명 + 무관한 1명을 가리키고, 그 주민의 직업 토큰을 보여줌.",
  librarian: "인플레이 외지인 1명 + 무관한 1명을 가리키고 외지인 직업 토큰. 외지인이 없으면 0을 알려줌.",
  investigator: "인플레이 하수인 1명 + 무관한 1명을 가리키고 하수인 직업 토큰.",
  undertaker: "오늘 처형된 플레이어의 직업 토큰을 보여줌. 처형이 없었으면 깨우지 않음.",
  ravenkeeper: "밤에 죽을 때만 깨움. 1명을 선택하면 그 직업을 알려줌.",
  // ── 배드 문 라이징 ──
  chambermaid: "고른 2명 중 오늘 밤 능력으로 깨어난 사람 수.",
  mathematician: "오늘 밤 능력이 오작동한(중독·취함 등으로 의도와 다르게 작동) 플레이어 수.",
  grandmother: "손주 1명을 가리키고 그 직업 토큰을 보여줌. 밤에 데몬이 손주를 죽이면 할머니도 사망.",
  // ── 종파의 제비꽃 ──
  clockmaker: "데몬에서 가장 가까운 하수인까지의 좌석 거리(시계/반시계 중 짧은 쪽 걸음 수).",
  oracle: "사망한 플레이어 중 악(데몬+하수인) 수.",
  juggler: "어제 낮 곡예사가 추측한 것 중 맞힌 개수.",
  // ── 기타/실험 ──
  general: "우세 진영 판단 — 선(엄지 위)/악(엄지 아래)/막상막하(엄지 옆).",
  villageidiot: "가리킨 플레이어의 선/악을 엄지로 신호. 백치가 여럿이면 1명은 취함(거짓 정보).",
  xaan: "X일차 밤, 생존한 모든 마을주민에게 중독 마커를 일괄 적용(황혼까지).",
};

/** 직업의 행동 스펙. 미등재(커스텀)는 자유 입력으로 폴백. */
export function actionSpec(characterId: string): ActionSpec {
  return ACTION_SPECS[characterId] ?? { targets: 1, result: "text" };
}

/** 밤 행동 스펙 — 그 외 밤에 행동이 달라지는 직업(메제펠레스 등) 반영. */
export function nightActionSpec(characterId: string, isFirstNight: boolean): ActionSpec {
  if (!isFirstNight && OTHER_NIGHT_SPECS[characterId]) return OTHER_NIGHT_SPECS[characterId];
  return actionSpec(characterId);
}

/** 낮 능력 스펙. 낮 능력 없으면 undefined. */
export function dayActionSpec(characterId: string): ActionSpec | undefined {
  return DAY_ACTION_SPECS[characterId];
}

/** 게임당 1회 능력(밤·낮 어디든)인지. 사용 시 'noability' 마커 자동 부여 판정용. */
export function isOncePerGame(characterId: string): boolean {
  return !!(ACTION_SPECS[characterId]?.oncePerGame || DAY_ACTION_SPECS[characterId]?.oncePerGame);
}

/**
 * 일회성 능력이 이미 소진됐는지 — 'noability:<직업>' 영구 마커로 판정(구버전 bare 'noability' 호환).
 * 한 좌석에 여러 일회성 능력(철학자+획득직업 등)이 있어도 해당 직업 마커만 본다.
 * NightSidebar/DaySidebar가 같은 규칙을 쓰도록 단일화.
 */
export function isAbilityUsedUp(
  oncePerGame: boolean | undefined,
  characterId: string,
  markers: string[],
): boolean {
  return !!oncePerGame && markers.some((m) => m === "noability" || m === `noability:${characterId}`);
}

/** 페이즈에 맞는 스펙. 복기 등에서 기록을 해석할 때 사용. day 생략 시 첫밤 기준. */
export function specForPhase(characterId: string, phase: string, day?: number): ActionSpec {
  if (phase === "day") return DAY_ACTION_SPECS[characterId] ?? actionSpec(characterId);
  return nightActionSpec(characterId, day === undefined || day === 1);
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
  return characterId === "marionette" || characterId === "magician";
}

/**
 * 대상을 *플레이어가 아니라 이야기꾼이* 고르는 정보 직업 — 세탁부·조사자류("이 두 명 중 하나가 X").
 * 이들은 ST가 가리킬 좌석을 정하고 직접 기록하므로 '대상 고르게 하기'(플레이어 선택 요청)를 띄우지 않는다.
 */
export const ST_CHOOSES_TARGETS: ReadonlySet<string> = new Set<string>([
  "washerwoman", "librarian", "investigator", // 트러블 브루잉 — "이 두 명 중 한 명이 X"
  "grandmother", "balloonist", // 특정 플레이어의 직업을 알려주는 정보
  "steward", "bountyhunter", "noble", "knight", "highpriestess", "choirboy", "sage", // 플레이어에 대한 정보
  "virgin", // 낮 — 대상은 지목자(플레이어가 고르지 않음, ST가 기록)
]);

/**
 * targets를 *플레이어가 직접* 고를 능력인지 — 킬/보호/독/저주(대개 result:none) + 자기정보 선택(점쟁이·까마귀지기 등).
 * playerPicks(직업 선택)와 ST가 대상을 정하는 정보 직업(ST_CHOOSES_TARGETS)은 제외한다.
 * 온라인 순서 패널이 '대상 고르게 하기'(pick-players push)를 띄울지 판정하는 단일 출처.
 */
export function playerChoosesTargets(characterId: string, spec: ActionSpec): boolean {
  return spec.targets >= 1 && !spec.playerPicks && !ST_CHOOSES_TARGETS.has(characterId);
}

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
