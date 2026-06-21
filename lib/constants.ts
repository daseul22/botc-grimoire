import type { Alignment, EditionId, Localized, Team } from "./types";

export const TEAMS: { id: Team; label: Localized; color: string }[] = [
  { id: "townsfolk", label: { ko: "마을주민", en: "Townsfolk" }, color: "#4a90d9" },
  { id: "outsider", label: { ko: "외지인", en: "Outsider" }, color: "#37b0a6" },
  { id: "minion", label: { ko: "하수인", en: "Minion" }, color: "#e08a3c" },
  { id: "demon", label: { ko: "악마", en: "Demon" }, color: "#d23b3b" },
  { id: "traveller", label: { ko: "여행자", en: "Traveller" }, color: "#9b6dd0" },
  { id: "fabled", label: { ko: "전설", en: "Fabled" }, color: "#d4a23a" },
  { id: "loric", label: { ko: "설화", en: "Loric" }, color: "#7a8aa0" },
];

export const TEAM_MAP: Record<Team, (typeof TEAMS)[number]> = Object.fromEntries(
  TEAMS.map((t) => [t.id, t]),
) as Record<Team, (typeof TEAMS)[number]>;

/** 진영 색 — 선=마을주민 파랑, 악=악마 빨강. 팀 색과 단일 출처를 공유한다. */
export const ALIGN_COLOR: Record<Alignment, string> = {
  good: TEAM_MAP.townsfolk.color,
  evil: TEAM_MAP.demon.color,
};

export const EDITIONS: { id: EditionId; label: Localized }[] = [
  { id: "trouble-brewing", label: { ko: "트러블 브루잉", en: "Trouble Brewing" } },
  { id: "bad-moon-rising", label: { ko: "배드 문 라이징", en: "Bad Moon Rising" } },
  { id: "sects-and-violets", label: { ko: "종파의 제비꽃", en: "Sects & Violets" } },
  { id: "loric", label: { ko: "설화", en: "Loric" } },
  { id: "other", label: { ko: "기타", en: "Other" } },
];

export const EDITION_MAP: Record<EditionId, (typeof EDITIONS)[number]> =
  Object.fromEntries(EDITIONS.map((e) => [e.id, e])) as Record<
    EditionId,
    (typeof EDITIONS)[number]
  >;
