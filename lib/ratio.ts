import type { Alignment, Team } from "./types";

// 순수 모듈 — 클라이언트/서버 공용.

export type CoreTeam = "townsfolk" | "outsider" | "minion" | "demon";
export const CORE_TEAMS: CoreTeam[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
];

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

// 공식 인원수별 직업군 분포 (5~15인): [마을주민, 외부인, 하수인, 악마]
const TABLE: Record<number, [number, number, number, number]> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

export type Ratio = Record<CoreTeam, number>;

export function defaultRatio(n: number): Ratio {
  const c = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n));
  const [townsfolk, outsider, minion, demon] = TABLE[c] ?? TABLE[MAX_PLAYERS];
  return { townsfolk, outsider, minion, demon };
}

export const ratioTotal = (r: Ratio): number =>
  r.townsfolk + r.outsider + r.minion + r.demon;

export function alignmentOf(team: Team): Alignment {
  return team === "minion" || team === "demon" ? "evil" : "good";
}
