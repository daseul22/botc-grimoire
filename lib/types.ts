import type { CharacterBehavior } from "./behaviors";

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
  /** 사용자가 만든 커스텀 직업인가 (공식 183종이 아님) */
  custom?: boolean;
  /** 커스텀 직업 생성자 user id. 권한 게이팅용. 공식 직업은 null/undefined. */
  ownerId?: number | null;
  /**
   * 그리모어 동작 정의 — 지목 수·결과 종류·마커·보여주기 등.
   * 공식 직업은 data/behaviors.json(클라 번들에 정적 포함)에 있어 비워 두고,
   * **커스텀 직업과 동작이 수정된 공식 직업만** 여기에 실어 클라이언트로 나른다
   * (기존 sheetChars 전달 경로를 그대로 사용 → 별도 파이프 불필요).
   */
  behavior?: CharacterBehavior;
}

export interface Sheet {
  id: string;
  name: Localized;
  description?: Localized;
  difficulty?: "beginner" | "intermediate" | "advanced";
  characterIds: string[];
  /** 사용자가 만든 커스텀 시트 여부 (공식 시트가 아님) */
  custom?: boolean;
  /** 커스텀 시트 생성자 user id. 권한 게이팅용. 레거시/공식 시트는 null. */
  ownerId?: number | null;
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

/** 페이즈 — 밤/낮. (직렬화는 string이나 도메인 경계에서 좁힌다.) */
export type Phase = "night" | "day";
/** 좌석 생사 상태. */
export type SeatStatus = "alive" | "dead";
/** 사망 원인 — 처형/밤 살해/여행자 추방/기타/미사망. 사망 글리프·복기에 사용. */
export type DeathCause = "execution" | "night" | "exile" | "other" | "";

/** 서버 액션 공통 반환형 — 성공 값(T) 또는 에러. */
export type ServerActionResult<T> = T | { error: string };
/** PlayCanvas가 자식에 내려보내는 액션 디스패처(설계결정3: Game 반환→setGame). */
export type GameActionRun = (fn: () => Promise<ServerActionResult<Game>>) => void;

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
  status: SeatStatus;
  /** 효과 마커 ("base" 또는 "base:param") */
  markers: string[];
  /** 게임 내내 누적되는 이야기꾼 메모 (스냅샷 무관, 전역) */
  memo: string;
  /** 사망 원인 (현재 스냅샷). */
  deathCause: DeathCause;
  /** 유령표(데드 보트) 사용 여부 (전역) */
  ghostVoteUsed: boolean;
}

/** 한 낮의 지목·투표 기록 (스냅샷별). 대상(nominee) 기준 1건. */
export interface VoteRecord {
  /** 지목한 좌석 */
  nominator: number;
  /** 지목된 좌석 */
  nominee: number;
  /** 찬성표 수 */
  votes: number;
  /** 이 지목으로 처형됐는가 */
  executed: boolean;
  /** 찬성한 좌석 목록(온라인 시계바늘 투표에서 기록 — LAN 수동 집계는 없음). 복기 타임라인에 노출. */
  voters?: number[];
}

export interface Game {
  id: string;
  sheetId: string;
  /** 생성 시점 시트 이름 스냅샷 (시트가 바뀌거나 삭제돼도 유지) */
  sheetName: string;
  /** 이야기꾼이 지정한 게임 이름(구분용). 빈 문자열이면 sheetName으로 폴백 */
  label: string;
  /** 'playing' | 'finished' */
  status: string;
  /** 현재 페이즈 — 밤/낮. */
  phase: Phase;
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
  /** 현재 페이즈 스냅샷의 지목·투표 기록 */
  votes: VoteRecord[];
  /** 악마에게 알려준 블러핑 직업 id (전역, 최대 3) */
  bluffs: string[];
  /** 현재 페이즈 스냅샷에서 처리(능력 발동) 완료한 좌석 */
  doneSeats: number[];
  /** 현재 페이즈 스냅샷의 이야기꾼 메모(스크래치패드) */
  note: string;
  /** 게임 전역 마커(Vortox 영향·일식 등) — 좌석 단위가 아닌 게임 전체에 걸치는 효과 */
  globalMarkers: string[];
  /** 미치광이(lunatic)에게 보여줄 가짜 블러핑 직업 id 3개. 진짜 데몬 정보(game.bluffs)와는 별개. */
  lunaticBluffs: string[];
  /** 미치광이에게 가짜 하수인이라고 보여줄 좌석 번호들. */
  lunaticMinions: number[];
  /**
   * 좌석별 가짜 직업(disguise). 본인이 자기 진짜 직업을 모르는 직업(미치광이/주정뱅이)이
   * 폰(직업공유·직업배포)에서 볼 화면용. 키=좌석, 값=가짜로 보여줄 directory characterId.
   */
  disguises: Record<number, string>;
  /** 현재 페이즈(낮)의 타이머 — 밀담/공개토론 + 지목 후 주장/반론. 다른 페이즈로 advance하면 새 record. */
  phaseTimers: PhaseTimers;
  /** 낮 '지목 받기' 활성화 여부(ST가 열어야 플레이어가 지목 가능). 페이즈 스냅샷별 → 매 낮 리셋. */
  nominationsOpen: boolean;
  /** 실행 취소 스택 정보 — count=쌓인 조작 수, lastLabel=가장 최근 조작 이름. */
  undo: { count: number; lastLabel: string | null };
  /** 직업배포(claim)에서 점유된 좌석들 — ST가 좌석별 재열람 허용(점유 해제)할 때 사용. */
  claimedSeats: number[];
  /**
   * 현재 페이즈보다 앞선 가장 가까운 낮에 처형된 좌석 + 그 직업(장의사 자동 추천용). 처형 없으면 null.
   * 서버에서 직전 낮 스냅샷 votes로 계산 — game.votes(현재 페이즈)로는 알 수 없어 별도로 싣는다.
   */
  lastExecution: { seat: number; characterId: string } | null;
}

/** 한 번의 타이머 한 종류(밀담 또는 공개토론). */
export interface PhaseTimer {
  /** 설정된 길이(초). 0이면 미설정. */
  durationSec: number;
  /** 시작 timestamp(ms). 미시작이면 undefined. */
  startedAt?: number;
  /** 종료 timestamp(ms). 자연 만료 또는 ST가 정지. */
  finishedAt?: number;
}

export interface PhaseTimers {
  whisper?: PhaseTimer;
  open?: PhaseTimer;
  /** 지목 후 지목자 주장 시간(기본 1분). */
  claim?: PhaseTimer;
  /** 지목 후 피지목자 반론 시간(기본 1분). */
  rebuttal?: PhaseTimer;
}
