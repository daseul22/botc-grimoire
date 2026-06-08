// 효과 마커 정의 — 순수 모듈(클라이언트/서버 공용).
// transient=true 마커는 페이즈를 넘길 때 자동 제거된다.
// 사망(dead)은 마커가 아니라 player.status로 관리(영구).

export type Marker = {
  id: string;
  label: string;
  color: string;
  transient: boolean;
};

export const MARKERS: Marker[] = [
  { id: "poisoned", label: "중독", color: "#37b0a6", transient: true },
  { id: "protected", label: "보호", color: "#4a90d9", transient: true },
  { id: "dying", label: "사망예정", color: "#e08a3c", transient: true },
  { id: "drunk", label: "술취함", color: "#9b6dd0", transient: false },
];

export const MARKER_MAP: Record<string, Marker> = Object.fromEntries(
  MARKERS.map((m) => [m.id, m]),
);

export const isTransient = (id: string) => MARKER_MAP[id]?.transient ?? false;
