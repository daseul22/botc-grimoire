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

export type ActionSpec = {
  /** 지목 가능한 좌석 수의 상한 (0~상한) */
  targets: number;
  /** 기록할 결과 종류 */
  result: ResultKind;
  /** 결과로 대상에 적용 제안할 마커 id */
  marker?: string;
  /** 결과 입력 힌트 */
  hint?: string;
};

export const RESULT_KIND_LABEL: Record<ResultKind, string> = {
  none: "결과 없음",
  number: "숫자",
  yesno: "예/아니오",
  role: "직업",
  team: "진영",
  text: "메모",
};

// 직업별 스펙. 야간 행동이 있는 직업만 등재(없으면 기본값으로 처리).
export const ACTION_SPECS: Record<string, ActionSpec> = {
  // ── 트러블 브루잉 ──
  bureaucrat: { targets: 1, result: "none" },
  thief: { targets: 1, result: "none" },
  monk: { targets: 1, result: "none", marker: "protected" },
  poisoner: { targets: 1, result: "none", marker: "poisoned" },
  scarletwoman: { targets: 0, result: "none" },
  imp: { targets: 1, result: "none", marker: "dying" },
  washerwoman: { targets: 2, result: "role", hint: "둘 중 1명의 주민 직업" },
  librarian: { targets: 2, result: "role", hint: "둘 중 1명의 외지인(없으면 비움)" },
  investigator: { targets: 2, result: "role", hint: "둘 중 1명의 하수인 직업" },
  chef: { targets: 0, result: "number", hint: "이웃한 악 쌍 수" },
  empath: { targets: 0, result: "number", hint: "이웃 2명 중 악 수 (0~2)" },
  fortuneteller: { targets: 2, result: "yesno", hint: "둘 중 악마 있는가" },
  butler: { targets: 1, result: "none" },
  spy: { targets: 0, result: "none" },
  ravenkeeper: { targets: 1, result: "role", hint: "지목한 플레이어 직업" },
  undertaker: { targets: 0, result: "role", hint: "처형된 플레이어 직업" },

  // ── 배드 문 라이징 ──
  apprentice: { targets: 0, result: "text", hint: "얻은 능력" },
  innkeeper: { targets: 2, result: "none", marker: "protected", hint: "둘 보호, 1명 취함" },
  gambler: { targets: 1, result: "role", hint: "추측한 직업" },
  lunatic: { targets: 1, result: "none" },
  sailor: { targets: 1, result: "none", marker: "drunk-dusk" },
  courtier: { targets: 1, result: "none", marker: "drunk", hint: "3일 밤낮 취함" },
  exorcist: { targets: 1, result: "none" },
  godfather: { targets: 1, result: "none", marker: "dying" },
  devilsadvocate: { targets: 1, result: "none", marker: "protected", hint: "처형 생존" },
  zombuul: { targets: 1, result: "none", marker: "dying" },
  shabaloth: { targets: 2, result: "none", marker: "dying" },
  po: { targets: 3, result: "none", marker: "dying", hint: "1명 또는 3명" },
  pukka: { targets: 1, result: "none", marker: "poisoned" },
  assassin: { targets: 1, result: "none", marker: "dying" },
  grandmother: { targets: 1, result: "role", hint: "알게 된 선한 플레이어 직업" },
  gossip: { targets: 1, result: "none", marker: "dying" },
  professor: { targets: 1, result: "none", hint: "부활 대상" },
  tinker: { targets: 0, result: "none" },
  moonchild: { targets: 1, result: "none", marker: "dying" },
  chambermaid: { targets: 2, result: "number", hint: "능력으로 깬 수 (0~2)" },

  // ── 종파의 제비꽃 ──
  harlot: { targets: 1, result: "role", hint: "지목한 플레이어 직업" },
  barista: { targets: 1, result: "none" },
  bonecollector: { targets: 1, result: "none", hint: "능력 되찾을 사망자" },
  philosopher: { targets: 0, result: "role", hint: "얻은 선한 직업" },
  pithag: { targets: 1, result: "role", hint: "바꿀 직업" },
  snakecharmer: { targets: 1, result: "none" },
  eviltwin: { targets: 0, result: "none" },
  witch: { targets: 1, result: "none", hint: "저주: 지목하면 사망" },
  cerenovus: { targets: 1, result: "role", marker: "mad", hint: "집착시킬 선한 직업" },
  fanggu: { targets: 1, result: "none", marker: "dying" },
  nodashii: { targets: 1, result: "none", marker: "dying", hint: "이웃 주민 2명 중독" },
  vortox: { targets: 1, result: "none", marker: "dying" },
  vigormortis: { targets: 1, result: "none", marker: "dying" },
  clockmaker: { targets: 0, result: "number", hint: "악마-하수인 거리" },
  dreamer: { targets: 1, result: "text", hint: "선 직업 / 악 직업" },
  barber: { targets: 0, result: "none" },
  seamstress: { targets: 2, result: "yesno", hint: "둘이 같은 소속인가" },
  sweetheart: { targets: 1, result: "none", marker: "drunk" },
  sage: { targets: 2, result: "none", hint: "둘 중 1명이 악마" },
  mathematician: { targets: 0, result: "number", hint: "비정상 작동 능력 수" },
  flowergirl: { targets: 0, result: "yesno", hint: "악마가 투표했는가" },
  towncrier: { targets: 0, result: "yesno", hint: "하수인이 지목했는가" },
  oracle: { targets: 0, result: "number", hint: "사망자 중 악 수" },
  juggler: { targets: 0, result: "number", hint: "맞힌 추측 수" },

  // ── 기타/실험 직업 ──
  princess: { targets: 0, result: "none" },
  noble: { targets: 3, result: "none", hint: "3명 중 1명만 악" },
  engineer: { targets: 0, result: "text", hint: "지정한 악역 구성" },
  knight: { targets: 2, result: "none", hint: "악마 아닌 2명" },
  amnesiac: { targets: 0, result: "text" },
  acrobat: { targets: 1, result: "none" },
  farmer: { targets: 1, result: "none" },
  lycanthrope: { targets: 1, result: "none", marker: "dying" },
  highpriestess: { targets: 1, result: "none" },
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
  general: { targets: 0, result: "text", hint: "우세 팀(선/악/없음)" },
  preacher: { targets: 1, result: "none" },
  pixie: { targets: 0, result: "role", hint: "알게 된 주민 직업" },
  bountyhunter: { targets: 1, result: "none", hint: "악한 플레이어" },
  hatter: { targets: 0, result: "none" },
  snitch: { targets: 0, result: "none" },
  damsel: { targets: 0, result: "none" },
  plaguedoctor: { targets: 0, result: "none" },
  ogre: { targets: 1, result: "none" },
  organgrinder: { targets: 0, result: "none", marker: "drunk-dusk" },
  fearmonger: { targets: 1, result: "none" },
  boffin: { targets: 0, result: "none" },
  marionette: { targets: 0, result: "none" },
  wizard: { targets: 0, result: "text", hint: "소원/결과" },
  // ST가 메제펠리스에게 비밀 단어를 알려주고, 누군가 그 단어를 말하면 변절(turning) 처리.
  // result=text로 단어를 입력해 두면 show 페이지에서 큰 글자로 보여줄 수 있다.
  mezepheles: { targets: 0, result: "text", hint: "비밀 단어" },
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
  slayer: { targets: 1, result: "yesno", marker: "dying", hint: "악마 적중?" },
  virgin: { targets: 1, result: "yesno", marker: "dying", hint: "지목자 주민→처형?" },
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
  fisherman: { targets: 0, result: "text", hint: "조언" },
  alsaahir: { targets: 0, result: "text", hint: "하수인·악마 추측" },
  puzzlemaster: { targets: 1, result: "role", hint: "취한 자 추측→악마" },
  psychopath: { targets: 1, result: "none", marker: "dying" },
  gangster: { targets: 1, result: "none", marker: "dying" },
};

/** 직업의 행동 스펙. 미등재(커스텀)는 자유 입력으로 폴백. */
export function actionSpec(characterId: string): ActionSpec {
  return ACTION_SPECS[characterId] ?? { targets: 1, result: "text" };
}

/** 낮 능력 스펙. 낮 능력 없으면 undefined. */
export function dayActionSpec(characterId: string): ActionSpec | undefined {
  return DAY_ACTION_SPECS[characterId];
}

/** 페이즈에 맞는 스펙. 복기 등에서 기록을 해석할 때 사용. */
export function specForPhase(characterId: string, phase: string): ActionSpec {
  if (phase === "day") return DAY_ACTION_SPECS[characterId] ?? actionSpec(characterId);
  return actionSpec(characterId);
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
