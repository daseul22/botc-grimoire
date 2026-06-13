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
   * show 페이지가 ?mode=...으로 분기 렌더한다.
   */
  mode?: "bluffs" | "minions" | "lunatic-bluffs" | "lunatic-minions" | "lunatic-choice";
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
  spy: { targets: 0, result: "none" },
  ravenkeeper: { targets: 1, result: "role", oncePerGame: true, deathTriggered: true, hint: "지목한 플레이어 직업", showcase: { heading: "{target}의 직업은 {role}입니다", tokens: ["result"] } },
  undertaker: { targets: 0, result: "role", hint: "처형된 플레이어 직업", showcase: { heading: "오늘 처형된 사람의 직업은 {role}입니다", tokens: ["result"] } },

  // ── 배드 문 라이징 ──
  apprentice: { targets: 0, result: "text", hint: "얻은 능력" },
  innkeeper: { targets: 2, result: "none", marker: "protected", hint: "둘 보호, 1명 취함" },
  gambler: { targets: 1, result: "role", hint: "추측한 직업" },
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
  exorcist: { targets: 1, result: "none" },
  godfather: { targets: 1, result: "none", marker: "dying" },
  devilsadvocate: { targets: 1, result: "none", marker: "protected", hint: "처형 생존" },
  zombuul: { targets: 1, result: "none", marker: "dying" },
  shabaloth: { targets: 2, result: "none", marker: "dying" },
  po: { targets: 3, result: "none", marker: "dying", hint: "1명 또는 3명" },
  pukka: { targets: 1, result: "none", marker: "poisoned" },
  assassin: { targets: 1, result: "none", marker: "dying", oncePerGame: true },
  grandmother: { targets: 1, result: "role", hint: "알게 된 선한 플레이어 직업" },
  gossip: { targets: 1, result: "none", marker: "dying" },
  professor: { targets: 1, result: "none", oncePerGame: true, hint: "부활 대상" },
  tinker: { targets: 0, result: "none" },
  moonchild: { targets: 1, result: "none", marker: "dying" },
  chambermaid: { targets: 2, result: "number", hint: "능력으로 깬 수 (0~2)" },

  // ── 종파의 제비꽃 ──
  harlot: { targets: 1, result: "role", hint: "지목한 플레이어 직업" },
  barista: { targets: 1, result: "none" },
  bonecollector: { targets: 1, result: "none", hint: "능력 되찾을 사망자" },
  philosopher: { targets: 0, result: "role", oncePerGame: true, hint: "얻은 선한 직업", showcase: { heading: "당신은 {role}의 능력을 얻었습니다", subheading: "기존 능력 대신 이 직업처럼 행동합니다", tokens: ["result"] } },
  pithag: { targets: 1, result: "role", hint: "바꿀 직업" },
  snakecharmer: { targets: 1, result: "none" },
  eviltwin: { targets: 0, result: "none" },
  witch: { targets: 1, result: "none", hint: "저주: 지목하면 사망" },
  cerenovus: { targets: 1, result: "role", marker: "mad", hint: "집착시킬 선한 직업", showcase: { recipient: "target", heading: "당신은 {role}에 집착해야 합니다", subheading: "그 직업이 아닌 척하면 이야기꾼이 처형할 수 있습니다", tokens: ["actor", "result"] } },
  fanggu: { targets: 1, result: "none", marker: "dying" },
  nodashii: { targets: 1, result: "none", marker: "dying", hint: "이웃 주민 2명 중독" },
  vortox: { targets: 1, result: "none", marker: "dying" },
  vigormortis: { targets: 1, result: "none", marker: "dying" },
  clockmaker: { targets: 0, result: "number", hint: "악마-하수인 거리" },
  dreamer: { targets: 1, result: "text", hint: "선 직업 / 악 직업" },
  barber: { targets: 0, result: "none" },
  seamstress: { targets: 2, result: "yesno", hint: "둘이 같은 소속인가", showcase: { heading: "두 사람이 같은 진영인가: {yn}", tokens: ["name", "name2"] } },
  sweetheart: { targets: 1, result: "none", marker: "drunk" },
  sage: { targets: 2, result: "none", hint: "둘 중 1명이 악마" },
  mathematician: { targets: 0, result: "number", hint: "비정상 작동 능력 수" },
  flowergirl: { targets: 0, result: "yesno", hint: "악마가 투표했는가" },
  towncrier: { targets: 0, result: "yesno", hint: "하수인이 지목했는가" },
  oracle: { targets: 0, result: "number", hint: "사망자 중 악 수", showcase: { heading: "사망자 중 {count}명이 악입니다" } },
  juggler: { targets: 0, result: "number", hint: "맞힌 추측 수" },

  // ── 기타/실험 직업 ──
  princess: { targets: 0, result: "none" },
  noble: { targets: 3, result: "none", hint: "3명 중 1명만 악", showcase: { heading: "이 세 명 중 정확히 한 명이 악입니다", tokens: ["names"] } },
  engineer: { targets: 0, result: "text", hint: "지정한 악역 구성" },
  knight: { targets: 2, result: "none", hint: "악마 아닌 2명" },
  amnesiac: { targets: 0, result: "text" },
  acrobat: { targets: 1, result: "none" },
  farmer: { targets: 1, result: "none" },
  lycanthrope: { targets: 1, result: "none", marker: "dying" },
  highpriestess: { targets: 1, result: "none" },
  // 마술사: 자체 보여주기 X. 데몬/하수인 정보 단계에 자동 포함되어 노출된다.
  // (show 페이지 ?mode=bluffs/minions가 인플레이 마술사 닉네임을 함께 표시.)
  magician: { targets: 0, result: "none" },
  villageidiot: { targets: 1, result: "team", hint: "대상의 팀" },
  banshee: { targets: 0, result: "none" },
  cultleader: { targets: 0, result: "team", hint: "현재 내 팀" },
  huntsman: { targets: 1, result: "none" },
  choirboy: { targets: 0, result: "none" },
  shugenja: { targets: 0, result: "text", hint: "시계/반시계 방향" },
  steward: { targets: 1, result: "none", hint: "선한 플레이어" },
  nightwatchman: { targets: 1, result: "none" },
  poppygrower: { targets: 0, result: "none" },
  alchemist: { targets: 0, result: "text", hint: "가진 하수인 능력" },
  balloonist: { targets: 1, result: "role", hint: "알게 된 플레이어 직업" },
  king: { targets: 0, result: "role", hint: "알게 된 생존 직업" },
  general: { targets: 0, result: "text", hint: "우세 팀(선/악/없음)", showcase: { heading: "오늘 우세한 진영: {result}" } },
  preacher: { targets: 1, result: "none" },
  pixie: { targets: 0, result: "role", hint: "집착할 주민 직업", showcase: { heading: "당신은 {role}에 집착해야 합니다", subheading: "집착에 성공했을 때, 그 사람이 죽으면 그의 능력을 얻습니다", tokens: ["result"] } },
  bountyhunter: { targets: 1, result: "none", hint: "악한 플레이어" },
  hatter: { targets: 0, result: "none" },
  snitch: { targets: 0, result: "none" },
  damsel: { targets: 0, result: "none" },
  plaguedoctor: { targets: 0, result: "none" },
  ogre: { targets: 1, result: "none" },
  organgrinder: { targets: 0, result: "none", marker: "drunk-dusk" },
  fearmonger: { targets: 1, result: "none" },
  boffin: { targets: 0, result: "none" },
  // 꼭두각시는 데몬에게 town으로 보이지만 실제로 evil. 데몬에게 두 가지 방식으로 알려준다.
  // 정확: "{actor}이 꼭두각시" / 모호: "이웃 중 한 명이 꼭두각시" (좌석은 안 알려줌)
  // recipient: none — 데몬에게 보여주는 화면이라 "꼭두각시 본인 닉네임 님께" 안내는 안 띄움.
  marionette: {
    targets: 0,
    result: "none",
    showcase: [
      { heading: "{actor}은(는) 꼭두각시입니다", subheading: "마을사람으로 보이지만 실제로는 악입니다", recipient: "none" },
      { heading: "이웃 중 한 명이 꼭두각시입니다", subheading: "양 옆 두 명 중 한 명이 꼭두각시(가짜 마을사람·악)입니다", recipient: "none" },
    ],
    showcaseLabels: ["정확", "이웃"],
  },
  wizard: { targets: 0, result: "text", hint: "소원/결과" },
  // ST가 메제펠리스에게 비밀 단어를 알려주고, 누군가 그 단어를 말하면 변절(turning) 처리.
  // result=text로 단어를 입력해 두면 show 페이지에서 큰 글자로 보여줄 수 있다.
  mezepheles: { targets: 0, result: "text", hint: "비밀 단어", showcase: { heading: "당신의 비밀 단어:", subheading: "이 단어를 누가 말하면 그 사람이 악으로 변절합니다", } },
  widow: { targets: 1, result: "none", marker: "poisoned" },
  summoner: { targets: 1, result: "none", hint: "악마가 될 대상" },
  wraith: { targets: 0, result: "none" },
  xaan: { targets: 0, result: "none", hint: "모든 주민 중독" },
  vizier: { targets: 0, result: "none" },
  harpy: { targets: 2, result: "none", marker: "mad", hint: "1번이 2번을 악으로 집착" },
  lleech: { targets: 1, result: "none", marker: "dying" },
  legion: { targets: 1, result: "none", marker: "dying" },
  leviathan: { targets: 0, result: "none" },
  lilmonsta: { targets: 1, result: "none", marker: "dying" },
  alhadikhia: { targets: 3, result: "none", marker: "dying" },
  yaggababble: { targets: 1, result: "none", marker: "dying" },
  ojo: { targets: 1, result: "none", marker: "dying" },
  kazali: { targets: 1, result: "none", marker: "dying" },
  lordoftyphon: { targets: 1, result: "none", marker: "dying" },
  riot: { targets: 0, result: "none" },
  cacklejack: { targets: 1, result: "none" },
  duchess: { targets: 3, result: "number", hint: "방문자 중 악 수" },
  buddhist: { targets: 0, result: "none" },
  toymaker: { targets: 0, result: "none" },
  angel: { targets: 0, result: "none" },

  // ── 로릭 ──
  tor: { targets: 0, result: "none" },
  stormcatcher: { targets: 0, result: "role", hint: "이름 댄 선한 직업" },
};

// 낮에 사용하는 능력. 야간순서에 없고 낮에 발동하는 직업만 등재.
// (곡예사·험담꾼처럼 밤/낮 둘 다 있는 직업은 양쪽에 등재 — 페이즈별로 따로 기록됨)
export const DAY_ACTION_SPECS: Record<string, ActionSpec> = {
  // ── 트러블 브루잉 ──
  slayer: { targets: 1, result: "yesno", marker: "dying", oncePerGame: true, hint: "악마 적중?" },
  virgin: { targets: 1, result: "yesno", marker: "dying", oncePerGame: true, hint: "지목자 주민→처형?" },
  gunslinger: { targets: 1, result: "none", marker: "dying" },

  // ── 배드 문 라이징 ──
  gossip: { targets: 0, result: "text", hint: "공개 발언" },

  // ── 종파의 제비꽃 ──
  juggler: { targets: 0, result: "text", hint: "추측 (최대 5)" },
  savant: { targets: 0, result: "text", hint: "정보 2 (1참 1거짓)" },
  artist: { targets: 0, result: "yesno", hint: "예/아니오 질문 답" },
  klutz: { targets: 1, result: "none", hint: "악이면 팀 패배" },

  // ── 기타/실험 직업 ──
  princess: { targets: 1, result: "none", hint: "지목·처형" },
  amnesiac: { targets: 0, result: "text", hint: "능력 추측 정확도" },
  fisherman: { targets: 0, result: "text", oncePerGame: true, hint: "조언" },
  alsaahir: { targets: 0, result: "text", hint: "하수인·악마 추측" },
  puzzlemaster: { targets: 1, result: "role", hint: "취한 자 추측→악마" },
  psychopath: { targets: 1, result: "none", marker: "dying" },
  gangster: { targets: 1, result: "none", marker: "dying" },
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
      heading: "{target}은(는) 메제펠레스에 의해 변절되었습니다",
      subheading: "지금부터 당신은 악 진영입니다",
    },
  },
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

/** 페이즈에 맞는 스펙. 복기 등에서 기록을 해석할 때 사용. day 생략 시 첫밤 기준. */
export function specForPhase(characterId: string, phase: string, day?: number): ActionSpec {
  if (phase === "day") return DAY_ACTION_SPECS[characterId] ?? actionSpec(characterId);
  return nightActionSpec(characterId, day === undefined || day === 1);
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
