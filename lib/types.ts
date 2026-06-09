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

// ── 그리모어 게임 운영 (Phase 2) ──
export type Alignment = "good" | "evil";

/** 한 페이즈(스냅샷)에 기록되는 직업의 야간 행동. 행동 직업(actor) 좌석 기준. */
export interface NightActionRecord {
  /** 행동한 좌석 */
  actorSeat: number;
  /** 행동 시점의 직업(복기 self-contained용 스냅샷) */
  characterId: string;
  /** 지목한 좌석들 */
  targets: number[];
  /** 결과 — 종류와 무관하게 문자열 저장(lib/night-actions.ts ResultKind 참고) */
  result: string;
  /** 공개 주장(블러핑)인가 — true면 actorSeat가 characterId를 실제로 갖지 않을 수 있음 */
  bluff?: boolean;
}

export interface GamePlayer {
  seat: number;
  nickname: string;
  characterId: string;
  alignment: Alignment;
  /** 캔버스 위치 (0~1 비율) */
  x: number;
  y: number;
  /** 위치 고정 (향후) */
  locked: boolean;
  /** 'alive' | 'dead' 등 (향후 확장) */
  status: string;
  /** 효과 마커 ("base" 또는 "base:param") */
  markers: string[];
  /** 게임 내내 누적되는 이야기꾼 메모 (스냅샷 무관, 전역) */
  memo: string;
}

export interface Game {
  id: string;
  sheetId: string;
  /** 생성 시점 시트 이름 스냅샷 (시트가 바뀌거나 삭제돼도 유지) */
  sheetName: string;
  /** 'playing' | 'finished' */
  status: string;
  /** 현재 페이즈 'night' | 'dusk' | 'day' (향후) */
  phase: string | null;
  /** N일차 (향후) */
  day: number;
  /** 'good' | 'evil' | null (향후) */
  result: string | null;
  /** 현재 보고 있는 페이즈 스냅샷 인덱스 (0부터) */
  phaseIndex: number;
  /** 전체 페이즈 스냅샷 수 */
  phaseCount: number;
  players: GamePlayer[];
  /** 현재 페이즈 스냅샷의 야간 행동 기록 */
  actions: NightActionRecord[];
  /** 악마에게 알려준 블러핑 직업 id (전역, 최대 3) */
  bluffs: string[];
}
