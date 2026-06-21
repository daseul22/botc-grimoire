// 서버 전용 인증·인가 모듈 (better-sqlite3 import → 클라 번들 금지, 의도된 가드).
//
// 설계: 외부 의존성 없이 SQLite + Node 내장 crypto 만으로 구현.
//   - 비밀번호: scrypt(솔트 16B) → 64B 해시. timingSafeEqual 검증.
//   - 세션: 추측 불가능한 랜덤 토큰(32B)을 쿠키에, DB엔 그 SHA-256 해시만 저장(DB 유출 대비).
//   - 역할: users.roles(JSON 배열). 'admin'은 모든 권한 포함. 중복 보유 가능.
// 보안 체크는 데이터 소스 가까이(서버 액션·민감 페이지)에서 수행한다(Next 권장).
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { ALL_ROLES, isRole, ROLE_LABEL, type Role } from "./auth-roles";

// 역할 상수는 클라이언트 공용 순수 모듈(auth-roles)에 둔다. 서버 측 편의를 위해 재노출.
export { ALL_ROLES, ROLE_LABEL, type Role };

const db = getDb();
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT '["player"]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);
// 구버전 db 보강 (idempotent) — 닉네임 마지막 변경 시각(쿨다운 판정용). null=변경 이력 없음.
try {
  db.exec("ALTER TABLE users ADD COLUMN nickname_changed_at TEXT");
} catch {
  /* 이미 존재 */
}

export const SESSION_COOKIE = "botc-session";
const SESSION_DAYS = 30;
/** 닉네임 변경 쿨다운(일). 3개월 ≈ 90일에 1회. */
export const NICKNAME_COOLDOWN_DAYS = 90;
const now = () => new Date().toISOString();

export type AuthUser = {
  id: number;
  loginId: string;
  nickname: string;
  roles: Role[];
  createdAt: string;
  /** 닉네임 마지막 변경 시각(ISO). null = 변경 이력 없음(즉시 변경 가능). */
  nicknameChangedAt: string | null;
};

type UserRow = {
  id: number;
  login_id: string;
  nickname: string;
  password_hash: string;
  password_salt: string;
  roles: string;
  created_at: string;
  nickname_changed_at: string | null;
};

function parseRoles(s: string): Role[] {
  try {
    const a = JSON.parse(s);
    const roles = Array.isArray(a) ? a.filter(isRole) : [];
    return roles.length ? roles : ["player"];
  } catch {
    return ["player"];
  }
}

function rowToUser(r: UserRow): AuthUser {
  return {
    id: r.id,
    loginId: r.login_id,
    nickname: r.nickname,
    roles: parseRoles(r.roles),
    createdAt: r.created_at,
    nicknameChangedAt: r.nickname_changed_at ?? null,
  };
}

// ── 비밀번호 ──
function hashPassword(password: string, salt: string = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}
function verifyPassword(password: string, hash: string, salt: string): boolean {
  const calc = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return calc.length === stored.length && timingSafeEqual(calc, stored);
}

// ── 토큰 ──
const newToken = () => randomBytes(32).toString("hex");
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** 강한 난수 비밀번호 생성(대/소문자·숫자·특수문자 각각 보장). 부트스트랩 관리자용. */
export function generatePassword(len = 16): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // I,O 제외
  const L = "abcdefghijkmnopqrstuvwxyz"; // l 제외
  const D = "23456789"; // 0,1 제외
  const S = "!@#$%^&*-_=+?";
  const all = U + L + D + S;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(U), pick(L), pick(D), pick(S), pick(S)];
  while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ── 정규화 ──
/** 로그인 ID는 대소문자 무시(소문자 정규화). 닉네임은 통계 닉네임 문자열과 정확히 매칭해야 하므로 trim만. */
export const normalizeLoginId = (s: string) => s.trim().toLowerCase();
// 닉네임은 통계 닉네임 문자열과 정확히 매칭해야 한다. trim + 유니코드 NFC 정규화로
// 결합문자(NFD, macOS 등) 차이로 인한 통계 연동 누락을 막는다(대소문자는 의도적으로 구분).
export const normalizeNickname = (s: string) => s.trim().normalize("NFC");

// ── 조회 ──
export function getUserById(id: number): AuthUser | undefined {
  const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return r ? rowToUser(r) : undefined;
}
export function loginIdExists(loginId: string): boolean {
  return !!db.prepare("SELECT 1 FROM users WHERE login_id = ?").get(normalizeLoginId(loginId));
}
export function nicknameExists(nickname: string): boolean {
  return !!db.prepare("SELECT 1 FROM users WHERE nickname = ?").get(normalizeNickname(nickname));
}
/** 닉네임(NFC)에 매핑되는 가입 계정 id. 없으면 null. 게임 좌석을 계정에 바인딩할 때 사용. */
export function userIdByNickname(nickname: string): number | null {
  const r = db.prepare("SELECT id FROM users WHERE nickname = ?").get(normalizeNickname(nickname)) as
    | { id: number }
    | undefined;
  return r ? r.id : null;
}
/** user id → 현재 닉네임 맵. 통계를 계정 기준으로 묶어 '현재 닉네임'으로 표시할 때 사용. */
export function userNicknamesById(): Map<number, string> {
  const rows = db.prepare("SELECT id, nickname FROM users").all() as {
    id: number;
    nickname: string;
  }[];
  return new Map(rows.map((r) => [r.id, r.nickname]));
}

// ── 생성/검증 ──
/** 가입. 호출 전에 중복(loginIdExists/nicknameExists)을 검사하라. 경합 시 UNIQUE 제약으로 throw. */
export function createUser(input: {
  loginId: string;
  nickname: string;
  password: string;
  roles?: Role[];
}): AuthUser {
  const { hash, salt } = hashPassword(input.password);
  const roles = input.roles?.length ? input.roles : (["player"] as Role[]);
  const info = db
    .prepare(
      "INSERT INTO users (login_id,nickname,password_hash,password_salt,roles,created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(
      normalizeLoginId(input.loginId),
      normalizeNickname(input.nickname),
      hash,
      salt,
      JSON.stringify(roles),
      now(),
    );
  return getUserById(Number(info.lastInsertRowid))!;
}

/** 로그인 ID + 비밀번호 검증. 성공 시 사용자, 실패 시 null. */
export function verifyCredentials(loginId: string, password: string): AuthUser | null {
  const r = db.prepare("SELECT * FROM users WHERE login_id = ?").get(normalizeLoginId(loginId)) as
    | UserRow
    | undefined;
  if (!r) return null;
  return verifyPassword(password, r.password_hash, r.password_salt) ? rowToUser(r) : null;
}

/** 특정 user id의 비밀번호 검증(비밀번호 변경 시 현재 비밀번호 확인용). */
export function verifyCredentialsById(userId: number, password: string): boolean {
  const r = db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").get(userId) as
    | { password_hash: string; password_salt: string }
    | undefined;
  return !!r && verifyPassword(password, r.password_hash, r.password_salt);
}

/** 닉네임 변경 쿨다운 상태. nextAt = 다음 변경 가능 시각(ISO), 가능하면 null. */
export function nicknameChangeStatus(user: AuthUser): {
  canChange: boolean;
  nextAt: string | null;
} {
  if (!user.nicknameChangedAt) return { canChange: true, nextAt: null };
  const next = new Date(user.nicknameChangedAt).getTime() + NICKNAME_COOLDOWN_DAYS * 86400000;
  if (Date.now() >= next) return { canChange: true, nextAt: null };
  return { canChange: false, nextAt: new Date(next).toISOString() };
}

/** 닉네임 변경(쿨다운/고유성/연결 확인은 호출부에서 검증). nickname_changed_at을 now로 기록. */
export function changeNickname(userId: number, newNickname: string): void {
  db.prepare("UPDATE users SET nickname = ?, nickname_changed_at = ? WHERE id = ?").run(
    normalizeNickname(newNickname),
    now(),
    userId,
  );
}

export function changePassword(userId: number, newPassword: string): void {
  const { hash, salt } = hashPassword(newPassword);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(
      hash,
      salt,
      userId,
    );
    // 비밀번호 변경의 핵심 목적(유출·탈취된 기존 접근 차단): 이 사용자의 모든 세션을 폐기.
    // 본인 현재 세션은 호출부(changePasswordAction)에서 createSession으로 재발급한다.
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  })();
}

// ── 세션 ──
/** 세션 생성 + 세션 쿠키 설정. 현재 사용자가 됨. */
export async function createSession(userId: number): Promise<void> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  // 기회적 정리: 만료된 세션 행을 함께 제거해 sessions 테이블이 무한히 커지지 않게 한다.
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
  db.prepare(
    "INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)",
  ).run(hashToken(token), userId, now(), expires.toISOString());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    // 로컬 LAN(http)에서도 동작해야 하므로 secure는 강제하지 않는다.
  });
}

/** 현재 세션 파기 + 쿠키 삭제(로그아웃). */
export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

/**
 * 현재 로그인 사용자(없으면 null). React cache로 한 요청 내 중복 질의를 합친다.
 * 서버 컴포넌트·서버 액션 어디서든 호출 가능.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const r = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), now()) as UserRow | undefined;
  return r ? rowToUser(r) : null;
});

// ── 역할 헬퍼 ──
export const hasRole = (u: AuthUser | null | undefined, role: Role): boolean =>
  !!u && (u.roles.includes("admin") || u.roles.includes(role));
export const isAdmin = (u: AuthUser | null | undefined): boolean => !!u && u.roles.includes("admin");
/** 이야기꾼 권한(관리자 포함). */
export const isStoryteller = (u: AuthUser | null | undefined): boolean => hasRole(u, "storyteller");

// ── 가드(서버 액션용 — 미인가 시 throw) ──
export async function requireUser(): Promise<AuthUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("로그인이 필요합니다.");
  return u;
}
export async function requireStoryteller(): Promise<AuthUser> {
  const u = await requireUser();
  if (!isStoryteller(u)) throw new Error("이야기꾼 권한이 필요합니다.");
  return u;
}
export async function requireAdmin(): Promise<AuthUser> {
  const u = await requireUser();
  if (!isAdmin(u)) throw new Error("관리자 권한이 필요합니다.");
  return u;
}

// ── 관리자: 역할/사용자 관리 ──
export function listUsers(): AuthUser[] {
  return (db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[]).map(
    rowToUser,
  );
}
export function countAdmins(): number {
  // roles는 JSON 문자열 — 'admin' 포함 여부로 근사 카운트.
  return (db.prepare("SELECT roles FROM users").all() as { roles: string }[]).filter((r) =>
    parseRoles(r.roles).includes("admin"),
  ).length;
}
/** 사용자 역할 전체 교체. 'player'는 항상 포함되도록 보정. */
export function setUserRoles(userId: number, roles: Role[]): void {
  const clean = ALL_ROLES.filter((r) => roles.includes(r));
  if (!clean.includes("player")) clean.push("player");
  db.prepare("UPDATE users SET roles = ? WHERE id = ?").run(JSON.stringify(clean), userId);
}

// ── 통계 연동: 가입된 닉네임 집합 ──
/** 가입 유저의 닉네임 집합. 통계/내역에서 '가입 유저 vs 게스트 닉네임' 구분에 사용. */
export function registeredNicknames(): Set<string> {
  const rows = db.prepare("SELECT nickname FROM users").all() as { nickname: string }[];
  return new Set(rows.map((r) => r.nickname));
}

// ── 부트스트랩 관리자 ──
// 관리자 계정이 하나도 없으면(=빈 DB) 기본 관리자를 1회 시드한다. 약한 고정 비밀번호를
// 심지 않고 매 설치마다 강한 난수 비밀번호를 생성해 서버 콘솔에 1회 출력한다.
// (운영 시작 후 /account 에서 비밀번호 변경 권장.)
const BOOTSTRAP_ADMIN_ID = "daseul0623";
(function ensureBootstrapAdmin() {
  try {
    if (countAdmins() > 0) return;
    if (loginIdExists(BOOTSTRAP_ADMIN_ID)) return;
    const nickname = nicknameExists("관리자")
      ? `관리자-${randomBytes(2).toString("hex")}`
      : "관리자";
    const password = generatePassword(16);
    createUser({
      loginId: BOOTSTRAP_ADMIN_ID,
      nickname,
      password,
      roles: ["admin", "storyteller", "player"],
    });
    console.warn(
      `\n[botc] 초기 관리자 계정 생성됨 — id: ${BOOTSTRAP_ADMIN_ID} / 비밀번호: ${password}\n       (최초 로그인 후 /account 에서 비밀번호 변경 권장)\n`,
    );
  } catch {
    // 시드 실패(경합/락 등)가 모듈 평가 전체를 무너뜨리지 않도록 무시. 다음 기동 때 재시도된다.
  }
})();
