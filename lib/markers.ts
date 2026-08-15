// 상태이상(효과 마커) 정의 — 순수 모듈(클라이언트/서버 공용).
//
// duration: 페이즈를 넘길 때 자동 소멸 규칙
//   - "phase"     : 다음 페이즈로 넘어가면 소멸 (밤→낮, 낮→밤 모두).
//   - "dusk"      : 황혼(낮 종료)까지 유지 → 낮이 끝날 때(낮→밤) 소멸. 밤→낮은 유지.
//   - "permanent" : 영구 유지 (수동으로만 해제).
// 사망(dead)은 마커가 아니라 player.status로 관리(영구).
//
// 마커는 "base" 또는 "base:param" 문자열로 저장한다. 예) "mad:imp" = 임프에 집착.
// icon: BotC에서 상태이상은 원인 캐릭터 토큰으로 표시(중독=독살자, 취함=주정뱅이,
// 집착=세레노버스, 보호=수도사, 사망예정=임프).

import type { Character } from "./types";

export type MarkerDuration = "phase" | "dusk" | "permanent";

export type Marker = {
  id: string;
  label: string;
  icon: string;
  color: string;
  duration: MarkerDuration;
  /** 대상 역할을 선택하는 마커인가 (집착·직업변경·능력획득) */
  needsTarget?: boolean;
  /** 한 좌석에 여러 인스턴스를 동시에 가질 수 있는가 (능력획득·능력없음).
   *  식인종이 철학자를 먹고 → 철학자 능력으로 또 다른 직업을 얻는 식으로 능력획득/없음이 누적될 수 있다.
   *  기본은 단일(교체). multi면 SelectionPanel에서 인스턴스별 칩 + 개별 제거 + 추가 UI로 다룬다. */
  multi?: boolean;
  /** param이 직업 id이고, 토큰을 해당 직업 심볼로 표시하는가 */
  roleParam?: boolean;
  /** icon이 없을 때 토큰 자리에 표시할 글자/기호(1~2자). 색깔 원만 보이는 가독성 문제 회피용. */
  letter?: string;
  /** "seat"(기본) = 좌석 단위 마커, "global" = 게임 전체 효과(Vortox·일식 등) */
  scope?: "seat" | "global";
  /** 정보 직업이 거짓 정보를 받아야 하는 상태인가 (취함·중독·Vortox). 좌석/글로벌 공용. */
  taints?: boolean;
};

export const MARKERS: Marker[] = [
  { id: "poisoned", label: "중독", icon: "/icons/poisoner.webp", color: "#37b0a6", duration: "dusk", taints: true },
  { id: "drunk-dusk", label: "취함", icon: "/icons/drunk.webp", color: "#9b6dd0", duration: "dusk", taints: true },
  { id: "drunk", label: "취함", icon: "/icons/drunk.webp", color: "#9b6dd0", duration: "permanent", taints: true },
  { id: "mad", label: "집착", icon: "/icons/cerenovus.webp", color: "#ec6cae", duration: "dusk", needsTarget: true, roleParam: true },
  { id: "protected", label: "보호", icon: "/icons/monk.webp", color: "#4a90d9", duration: "phase" },
  // 처형 생존(악마의 변호사) — 밤에 걸어 '다음 낮 처형'까지 유지돼야 하므로 dusk(밤→낮 유지, 낮→밤 소멸).
  // protected(phase)는 밤→낮 전환에 사라져 정작 그 낮 처형 시점엔 없으므로 별도 마커로 분리.
  { id: "execsafe", label: "처형 생존", icon: "/icons/devilsadvocate.webp", color: "#4a90d9", duration: "dusk" },
  { id: "dying", label: "사망예정", icon: "/icons/imp.webp", color: "#e08a3c", duration: "phase" },
  { id: "herring", label: "레드헤링", icon: "/icons/fortuneteller.webp", color: "#d23b3b", duration: "permanent" },
  { id: "became", label: "직업 변경", icon: "", color: "#c0653a", duration: "permanent", needsTarget: true, roleParam: true, letter: "↺" },
  { id: "gained", label: "능력 획득", icon: "", color: "#5aa86a", duration: "permanent", needsTarget: true, multi: true, roleParam: true, letter: "✦" },
  // 처형자(Executioner)·성결자 같은 일회성 능력 소진 후 표시. 영구.
  // needsTarget/roleParam — 대상 있는 케이스(처형자가 가졌던 좋은 직업) 토큰도 함께 보일 수 있게.
  // 대상 없이도 마커 단독 적용 가능(아래 SelectionPanel의 onPick 로직 참고).
  { id: "noability", label: "능력 없음", icon: "", color: "#7a7a7a", duration: "permanent", needsTarget: true, multi: true, roleParam: true, letter: "✕" },
  // 변절 예정(메제펠리스 단어 발화 후 다음 밤에 악으로 변절). dusk로 만료될 때
  // advancePhase 내부에서 자동으로 alignment를 evil로 바꾼다.
  { id: "turning", label: "변절 예정", icon: "", color: "#d23b3b", duration: "dusk", letter: "⇄" },

  // ── 글로벌(게임 전체) 마커 ──
  // Vortox(SnV 악마): 살아있는 동안 모든 정보 직업이 거짓 정보를 받는다.
  { id: "vortox", label: "Vortox 영향", icon: "/icons/vortox.webp", color: "#d23bbd", duration: "permanent", scope: "global", taints: true, letter: "V" },
];

export const MARKER_MAP: Record<string, Marker> = Object.fromEntries(
  MARKERS.map((m) => [m.id, m]),
);

export const DURATION_LABEL: Record<MarkerDuration, string> = {
  phase: "페이즈",
  dusk: "황혼까지",
  permanent: "영구",
};

/** "base:param" → { base, param } */
export function parseMarker(m: string): { base: string; param?: string } {
  const i = m.indexOf(":");
  return i === -1 ? { base: m } : { base: m.slice(0, i), param: m.slice(i + 1) };
}

/** 마커 문자열로 정의 조회 (param 무시) */
export const markerInfo = (m: string): Marker | undefined =>
  MARKER_MAP[parseMarker(m).base];

/** 사람이 읽는 마커 라벨. roleParam 마커는 직업명을 덧붙임. */
export function markerLabel(m: string, charMap: Record<string, Character>): string {
  const info = markerInfo(m);
  const { param } = parseMarker(m);
  if (info?.roleParam && param) return `${info.label}·${charMap[param]?.name.ko ?? param}`;
  return info?.label ?? m;
}

/**
 * 좌석이 *행동 순서·운영상* 어떤 직업으로 다뤄져야 하는지.
 * - 미치광이/주정뱅이/꼭두각시: disguises[seat] (가짜 직업)
 * - 식인종(cannibal) 등 능력 획득: gained:<role> 마커가 있으면 그 직업으로
 * - 직업 변경(became:<role>) 마커가 있으면 그 직업으로 (임프 자살 등)
 * 가짜/획득 직업이 없으면 원래 characterId 반환.
 */
export function effectiveCharacterId(
  seat: number,
  characterId: string,
  markers: string[],
  disguises: Record<number, string> | undefined,
): string {
  const disguise = disguises?.[seat];
  if (disguise) return disguise;
  for (const m of markers) {
    const { base, param } = parseMarker(m);
    if ((base === "became" || base === "gained") && param) return param;
  }
  return characterId;
}

/** 페이즈 전환 시 이 마커를 유지할지. leavingDay=낮→밤(황혼 통과) 여부. */
export function keepMarkerOnAdvance(m: string, leavingDay: boolean): boolean {
  const d = markerInfo(m)?.duration ?? "permanent";
  if (d === "permanent") return true;
  if (d === "phase") return false;
  return !leavingDay; // dusk: 낮이 끝날 때만 소멸
}

// 거짓 정보 경고: taints 마커(중독·취함·Vortox 영향 등)가 좌석/전역 어디든 있으면
// 정보 직업의 결과는 거짓이어야 한다.
const TAINT_BASES = new Set(MARKERS.filter((m) => m.taints).map((m) => m.id));
const hasTaintInList = (markers: string[]) =>
  markers.some((m) => TAINT_BASES.has(parseMarker(m).base));
export const isTainted = (seatMarkers: string[], globalMarkers: string[]): boolean =>
  hasTaintInList(seatMarkers) || hasTaintInList(globalMarkers);
