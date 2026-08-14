// 능력 조합 카탈로그 — 순수 모듈(클라이언트/서버 공용).
//
// lib/behaviors.ts가 "어떤 값이 가능한가"를 타입으로 정의한다면, 이 파일은 그 값들을
// **사람이 고를 수 있는 선택지**로 풀어 놓는다(한국어 라벨 + 설명 + 실제 직업 예시).
// 커스텀 직업 빌더 UI가 이 목록만 보고 폼을 그리므로, 기능을 새로 추가할 때
// 여기에 항목 하나만 늘리면 UI가 따라온다.

import { MARKER_MAP, MARKERS } from "./markers";
import type {
  ActionSpec,
  CharacterBehavior,
  ResultKind,
  ShowcaseSpec,
  ShowcaseToken,
} from "./behaviors";

export type Option<T extends string> = {
  id: T;
  label: string;
  /** 무엇을 하는 값인지 한 줄 설명 */
  desc: string;
  /** 이 값을 쓰는 대표 공식 직업(감을 잡게 하는 용도) */
  example?: string;
};

/** 결과 종류 — 행동 기록 시 어떤 입력 위젯이 뜨는지 결정한다. */
export const RESULT_KIND_OPTIONS: Option<ResultKind>[] = [
  {
    id: "none",
    label: "결과 없음",
    desc: "지목 자체가 결과. 살해·보호·중독처럼 정보를 주지 않는 능력.",
    example: "임프 · 수도사 · 독살범",
  },
  {
    id: "number",
    label: "숫자",
    desc: "0, 1, 2… 개수를 알려준다. 손가락 신호로 전달하는 정보 능력.",
    example: "공감자 · 요리사 · 신탁",
  },
  {
    id: "yesno",
    label: "예 / 아니오",
    desc: "끄덕임 하나로 답하는 판정. 고른 대상에 조건이 맞는지.",
    example: "점쟁이 · 꽃팔이 · 재봉사",
  },
  {
    id: "role",
    label: "직업",
    desc: "직업 토큰 하나를 보여준다. 대상의 정체나 획득한 능력.",
    example: "세탁부 · 까마귀지기 · 장의사",
  },
  {
    id: "team",
    label: "진영",
    desc: "선 또는 악. 대상이 어느 편인지만 알려준다.",
    example: "마을 백치 · 광신도",
  },
  {
    id: "text",
    label: "자유 입력",
    desc: "위 형식에 안 맞는 복잡한 결과를 이야기꾼이 직접 적는다.",
    example: "사반트 · 메제펠레스",
  },
];

/** 보여주기 화면의 토큰 슬롯 — 무엇을 화면에 띄울지. */
export type ShowcaseTokenOption = Option<ShowcaseToken> & {
  /** 대상의 직업(정체)을 드러내는 슬롯인가 — 켜면 상대 정체가 노출된다. */
  revealsIdentity: boolean;
};

export const SHOWCASE_TOKEN_OPTIONS: ShowcaseTokenOption[] = [
  {
    id: "result",
    label: "결과 토큰",
    desc: "결과가 직업/진영일 때 그 토큰을 크게 보여준다.",
    example: "세탁부가 본 주민 직업",
    revealsIdentity: false,
  },
  {
    id: "name",
    label: "대상 닉네임",
    desc: "첫 지목 대상의 닉네임 카드. 직업은 감춘다.",
    example: "점쟁이가 고른 사람",
    revealsIdentity: false,
  },
  {
    id: "name2",
    label: "대상2 닉네임",
    desc: "두 번째 지목 대상의 닉네임 카드.",
    revealsIdentity: false,
  },
  {
    id: "names",
    label: "대상 전원 닉네임",
    desc: "지목한 모든 좌석의 닉네임 카드.",
    example: "귀족 3명",
    revealsIdentity: false,
  },
  {
    id: "target",
    label: "대상 직업 토큰",
    desc: "첫 지목 대상의 **직업이 드러난다**. 정체를 알려도 되는 능력에만.",
    example: "성가대 소년이 본 악마",
    revealsIdentity: true,
  },
  {
    id: "target2",
    label: "대상2 직업 토큰",
    desc: "두 번째 지목 대상의 직업이 드러난다.",
    revealsIdentity: true,
  },
  {
    id: "targets",
    label: "대상 전원 직업 토큰",
    desc: "지목한 모든 좌석의 직업이 드러난다.",
    revealsIdentity: true,
  },
  {
    id: "actor",
    label: "본인 직업 토큰",
    desc: "능력 사용자의 직업 토큰. 상대에게 내 정체를 밝힐 때.",
    example: "야경꾼 · 세레노버스",
    revealsIdentity: false,
  },
  {
    id: "actorName",
    label: "본인 닉네임",
    desc: "능력 사용자의 닉네임 카드.",
    example: "꼭두각시를 악마에게 알릴 때",
    revealsIdentity: false,
  },
];

/** 보여주기를 누구에게 보여주는가. */
export const RECIPIENT_OPTIONS: Option<"actor" | "target" | "none">[] = [
  {
    id: "actor",
    label: "능력 사용자",
    desc: "능력을 쓴 본인에게 결과를 보여준다. 대부분의 정보 능력.",
    example: "점쟁이 · 공감자",
  },
  {
    id: "target",
    label: "지목당한 사람",
    desc: "첫 지목 대상에게 보여준다. 상대에게 무언가를 통보하는 능력.",
    example: "세레노버스 · 마귀할멈",
  },
  {
    id: "none",
    label: "제3자 (받는 사람 표기 없음)",
    desc: "능력 주인이 아닌 사람에게 보여줄 때. 화면에 '○○님께'를 띄우지 않는다.",
    example: "꼭두각시를 악마에게 알릴 때",
  },
];

/** 결과로 대상에게 걸 마커 — lib/markers.ts에서 좌석 단위 마커만 뽑는다. */
export const MARKER_OPTIONS: Option<string>[] = [
  { id: "", label: "없음", desc: "마커를 제안하지 않는다." },
  ...MARKERS.filter((m) => m.scope !== "global").map((m) => ({
    id: m.id,
    label: m.label,
    desc:
      m.duration === "phase"
        ? "다음 페이즈에 자동 소멸"
        : m.duration === "dusk"
          ? "황혼(낮 종료)에 자동 소멸"
          : "수동으로 지울 때까지 유지",
  })),
];

/** 운영 플래그 — 그리모어가 이 능력을 어떻게 다룰지. */
export const FLAG_OPTIONS: Option<
  "oncePerGame" | "deathTriggered" | "playerPicks" | "info"
>[] = [
  {
    id: "oncePerGame",
    label: "게임당 1회",
    desc: "쓰고 나면 '능력 사용함' 표시가 붙고 순서 행이 흐려진다.",
    example: "처단자 · 처녀 · 철학자",
  },
  {
    id: "deathTriggered",
    label: "사망 시 발동",
    desc: "죽어야 발동하는 능력. 죽어도 순서 행을 흐리지 않는다.",
    example: "까마귀지기 · 현자",
  },
  {
    id: "playerPicks",
    label: "플레이어가 직업 선택",
    desc: "플레이어가 폰에서 직접 직업을 고른다 → '직업 목록' 버튼이 뜬다.",
    example: "철학자 · 도박꾼 · 세레노버스",
  },
  {
    id: "info",
    label: "정보 능력으로 취급",
    desc: "자유 입력이지만 실질은 정보라, 취함·중독이면 '거짓 정보' 경고를 띄운다.",
    example: "꿈꾸는 자",
  },
];

/** 직업 단위 운영 플래그 — 페이즈와 무관하게 이 직업 전체에 걸린다. */
export const BEHAVIOR_FLAG_OPTIONS: Option<
  "stChoosesTargets" | "roleChange" | "gainResultAbility" | "showsWithoutRecord"
>[] = [
  {
    id: "stChoosesTargets",
    label: "이야기꾼이 대상 선택",
    desc: "플레이어에게 대상을 고르게 하지 않고 이야기꾼이 정해서 기록한다.",
    example: "세탁부 · 슬레이어",
  },
  {
    id: "roleChange",
    label: "대상의 직업을 실제로 바꿈",
    desc: "결과로 고른 직업으로 대상 좌석이 진짜 바뀐다(진영도 함께).",
    example: "마귀할멈 · 카잘리 · 소환사",
  },
  {
    id: "gainResultAbility",
    label: "결과 직업의 능력을 획득",
    desc: "본인에게 '능력 획득' 마커가 붙고, 그 직업이 게임에 있으면 원본이 취한다.",
    example: "철학자",
  },
  {
    id: "showsWithoutRecord",
    label: "기록 없이도 보여주기",
    desc: "지목·결과를 적지 않아도 보여주기 화면이 뜬다.",
    example: "마술사 · 꼭두각시",
  },
];

/**
 * 자주 쓰는 보여주기 템플릿.
 * 처음부터 heading을 쓰게 하면 막막하므로, 공식 직업에서 실제로 쓰이는 형태를 골라 담았다.
 * 고른 뒤 문구는 자유롭게 고칠 수 있다. `{...}`는 실제 값으로 치환된다.
 */
export type ShowcasePreset = {
  id: string;
  label: string;
  desc: string;
  /** 이 프리셋에 어울리는 결과 종류(빌더가 자동으로 맞춰 주는 힌트) */
  fits: ResultKind[];
  spec: ShowcaseSpec;
};

export const SHOWCASE_PRESETS: ShowcasePreset[] = [
  {
    id: "none",
    label: "보여주기 없음",
    desc: "화면을 띄우지 않는다. 이야기꾼이 손짓으로 전달하는 능력.",
    fits: ["none", "number", "yesno", "role", "team", "text"],
    spec: {},
  },
  {
    id: "count",
    label: "숫자 알려주기",
    desc: '"양 옆 이웃 중 1명이 악입니다" 형태.',
    fits: ["number"],
    spec: { heading: "{count}명입니다" },
  },
  {
    id: "yesno",
    label: "예/아니오 답",
    desc: '"이 두 명 중 데몬이 있는가: 예" 형태. 대상 닉네임을 함께 띄운다.',
    fits: ["yesno"],
    spec: { heading: "결과: {yn}", tokens: ["name", "name2"] },
  },
  {
    id: "oneOfTwo",
    label: "둘 중 하나가 이 직업",
    desc: '세탁부·조사자류. 닉네임 2개 + 직업 토큰 1개를 함께 보여준다.',
    fits: ["role"],
    spec: { heading: "이 두 명 중 한 명은 {role}입니다", tokens: ["result", "names"], stack: true },
  },
  {
    id: "thisPersonIs",
    label: "이 사람의 직업",
    desc: "지목한 한 명의 직업을 알려준다.",
    fits: ["role"],
    spec: { heading: "이 사람은 {role}입니다", tokens: ["result", "name"], stack: true },
  },
  {
    id: "thisPersonTeam",
    label: "이 사람의 진영",
    desc: "대상이 선인지 악인지만 알려준다.",
    fits: ["team"],
    spec: { heading: "이 사람은 {team}입니다", tokens: ["name"] },
  },
  {
    id: "gainedAbility",
    label: "능력을 얻었다",
    desc: "획득한 직업 토큰을 본인에게 보여준다.",
    fits: ["role"],
    spec: {
      heading: "당신은 {role}의 능력을 얻었습니다",
      subheading: "기존 능력 대신 이 직업처럼 행동합니다",
      tokens: ["result"],
    },
  },
  {
    id: "notifyTarget",
    label: "대상에게 통보",
    desc: "지목당한 사람에게 무슨 일이 벌어졌는지 알린다. 내 직업 토큰을 함께 보여준다.",
    fits: ["none", "role"],
    spec: {
      recipient: "target",
      heading: "당신은 선택되었습니다",
      subheading: "이 능력의 대상이 되었습니다",
      tokens: ["actor"],
    },
  },
  {
    id: "revealSelf",
    label: "내 정체를 밝힘",
    desc: "야경꾼처럼 상대에게 자기 직업과 닉네임을 드러낸다.",
    fits: ["none"],
    spec: {
      recipient: "target",
      heading: "이 사람의 정체입니다",
      subheading: "자신의 정체를 당신에게 밝혔습니다",
      tokens: ["actor", "actorName"],
      stack: true,
    },
  },
  {
    id: "theseAre",
    label: "이 사람들이 …이다",
    desc: "여러 명을 묶어 알려준다. 닉네임만 보여주고 직업은 감춘다.",
    fits: ["none"],
    spec: { heading: "이 사람들입니다", tokens: ["names"] },
  },
  {
    id: "secretWord",
    label: "비밀 단어 전달",
    desc: "이야기꾼이 적은 문구를 크게 띄운다.",
    fits: ["text"],
    spec: { heading: "당신의 비밀 단어:", subheading: "이 단어를 기억하세요" },
  },
];

/** heading/subheading에 쓸 수 있는 치환자 안내 — 빌더에서 도움말로 노출. */
export const PLACEHOLDERS: { token: string; desc: string }[] = [
  { token: "{count}", desc: "숫자 결과" },
  { token: "{yn}", desc: "예 / 아니오" },
  { token: "{role}", desc: "결과로 고른 직업 이름" },
  { token: "{team}", desc: "선 / 악" },
  { token: "{result}", desc: "결과 원문(자유 입력)" },
  { token: "{actor}", desc: "능력 사용자 닉네임" },
  { token: "{target}", desc: "첫 지목 대상 닉네임" },
  { token: "{target2}", desc: "두 번째 지목 대상 닉네임" },
  { token: "{targets}", desc: "지목 대상 전원 닉네임" },
];

/** 지목 수 선택지 — 0~3이 공식 직업 전체를 덮는다(알 하디키아 3명이 최대). */
export const TARGET_COUNT_OPTIONS = [0, 1, 2, 3] as const;

// ── 검증 ──
//
// 빌더 UI로만 만들면 유효한 값만 나오지만, 저장물은 JSON이라 손으로 고치거나 구버전 데이터가
// 섞일 수 있다. 잘못된 값은 throw하지 않고 조용히 이상 동작(지목 칸이 안 뜨거나 마커가 안 그려짐)하므로
// 저장 시점에 막는다. 순수 모듈이라 서버 액션과 빌더가 같은 규칙을 쓴다.

const RESULT_KINDS = new Set(RESULT_KIND_OPTIONS.map((o) => o.id));
const TOKEN_IDS = new Set(SHOWCASE_TOKEN_OPTIONS.map((o) => o.id));
const RECIPIENTS = new Set(RECIPIENT_OPTIONS.map((o) => o.id));

function validateSpec(spec: ActionSpec, where: string): string | undefined {
  if (!Number.isInteger(spec.targets) || spec.targets < 0 || spec.targets > 3)
    return `${where}: 지목 인원은 0~3이어야 합니다.`;
  if (!RESULT_KINDS.has(spec.result)) return `${where}: 결과 종류가 올바르지 않습니다.`;
  // 마커가 그리모어에 실존해야 좌석에 그릴 수 있다(없는 마커는 조용히 안 보인다).
  if (spec.marker && !MARKER_MAP[spec.marker]) return `${where}: 없는 마커입니다 (${spec.marker}).`;

  const showcases = Array.isArray(spec.showcase) ? spec.showcase : spec.showcase ? [spec.showcase] : [];
  for (const s of showcases) {
    for (const t of s.tokens ?? [])
      if (!TOKEN_IDS.has(t)) return `${where}: 보여주기 항목이 올바르지 않습니다 (${t}).`;
    if (s.recipient && !RECIPIENTS.has(s.recipient))
      return `${where}: 보여주기 수신자가 올바르지 않습니다.`;
    // 지목이 없는데 대상 기반 슬롯을 쓰면 화면이 비어 버린다 — 만들 때 잡는 편이 낫다.
    if (spec.targets === 0 && (s.tokens ?? []).some((t) => t !== "actor" && t !== "actorName" && t !== "result"))
      return `${where}: 지목이 없으면 대상 항목을 보여줄 수 없습니다.`;
    if (s.recipient === "target" && spec.targets === 0)
      return `${where}: 지목이 없으면 '지목당한 사람'에게 보여줄 수 없습니다.`;
  }
  return undefined;
}

/** 직업 동작 전체 검증. 문제가 있으면 사람이 읽는 메시지, 없으면 undefined. */
export function validateBehavior(b: CharacterBehavior): string | undefined {
  for (const [key, label] of [
    ["night", "첫째 밤"],
    ["otherNight", "그 외 밤"],
    ["day", "낮"],
  ] as const) {
    const spec = b[key];
    if (spec) {
      const bad = validateSpec(spec, label);
      if (bad) return bad;
    }
  }
  return undefined;
}
