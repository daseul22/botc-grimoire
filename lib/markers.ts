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
  /** param이 직업 id이고, 토큰을 해당 직업 심볼로 표시하는가 */
  roleParam?: boolean;
};

export const MARKERS: Marker[] = [
  { id: "poisoned", label: "중독", icon: "/icons/poisoner.webp", color: "#37b0a6", duration: "dusk" },
  { id: "drunk-dusk", label: "취함", icon: "/icons/drunk.webp", color: "#9b6dd0", duration: "dusk" },
  { id: "drunk", label: "취함", icon: "/icons/drunk.webp", color: "#9b6dd0", duration: "permanent" },
  { id: "mad", label: "집착", icon: "/icons/cerenovus.webp", color: "#ec6cae", duration: "dusk", needsTarget: true, roleParam: true },
  { id: "protected", label: "보호", icon: "/icons/monk.webp", color: "#4a90d9", duration: "phase" },
  { id: "dying", label: "사망예정", icon: "/icons/imp.webp", color: "#e08a3c", duration: "phase" },
  { id: "herring", label: "레드헤링", icon: "/icons/fortuneteller.webp", color: "#b07cd9", duration: "permanent" },
  { id: "became", label: "직업 변경", icon: "", color: "#c0653a", duration: "permanent", needsTarget: true, roleParam: true },
  { id: "gained", label: "능력 획득", icon: "", color: "#5aa86a", duration: "permanent", needsTarget: true, roleParam: true },
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

/** 페이즈 전환 시 이 마커를 유지할지. leavingDay=낮→밤(황혼 통과) 여부. */
export function keepMarkerOnAdvance(m: string, leavingDay: boolean): boolean {
  const d = markerInfo(m)?.duration ?? "permanent";
  if (d === "permanent") return true;
  if (d === "phase") return false;
  return !leavingDay; // dusk: 낮이 끝날 때만 소멸
}
