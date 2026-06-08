export type Lang = "ko" | "en";

export type Localized = { ko: string; en: string };

export type Team =
  | "townsfolk"
  | "outsider"
  | "minion"
  | "demon"
  | "traveller"
  | "fabled"
  | "loric";

export type EditionId =
  | "trouble-brewing"
  | "bad-moon-rising"
  | "sects-and-violets"
  | "loric"
  | "other";

/** 야간 행동: 순서(전역 정렬용)와 스토리텔러 리마인더. 행동 없으면 null. */
export type NightAction = { order: number; reminder: Localized | null } | null;

export interface Character {
  id: string;
  name: Localized;
  edition: EditionId;
  team: Team;
  ability: Localized;
  firstNight: NightAction;
  otherNight: NightAction;
  reminders: string[];
  /** 셋업에 영향(직업 구성 변경 등)을 주는가 */
  setup: boolean;
  setupNote?: Localized;
  /** 징크스 — 특정 직업과 함께 있을 때의 상호작용 규칙 ("상대 직업 : 규칙" 형식) */
  jinxes?: { ko: string[]; en: string[] };
  /** 분위기 글(flavor text) */
  flavor?: Localized;
  /** 상세정보 — 능력 작동 방식 상세 설명 */
  detail?: Localized;
  /** 운영방식 — 이야기꾼 진행 단계 */
  howTo?: { ko: string[]; en: string[] };
  /** 로컬 호스팅 아이콘 경로 (수집 전엔 비어 있을 수 있음) */
  image?: string;
}

export interface Sheet {
  id: string;
  name: Localized;
  description?: Localized;
  difficulty?: "beginner" | "intermediate" | "advanced";
  characterIds: string[];
  /** 사용자가 만든 커스텀 시트 여부 (공식 시트가 아님) */
  custom?: boolean;
}

export interface RulesSection {
  id: string;
  title: Localized;
  /** 본문 (단순 텍스트 / 줄바꿈 기준 문단) */
  body: Localized;
  order: number;
}
