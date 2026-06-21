// 순수 모듈(클라/서버 공용, DB 의존 없음) — 인증 역할 상수.
// 클라이언트 컴포넌트는 lib/auth(better-sqlite3 import → 클라 번들 금지)가 아니라
// 여기서 역할 상수를 가져온다.

export type Role = "admin" | "storyteller" | "player";

export const ALL_ROLES: Role[] = ["admin", "storyteller", "player"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "관리자",
  storyteller: "이야기꾼",
  player: "플레이어",
};

export const isRole = (r: unknown): r is Role =>
  r === "admin" || r === "storyteller" || r === "player";
