"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  changeNickname,
  changePassword,
  createSession,
  createUser,
  destroyCurrentSession,
  getCurrentUser,
  loginIdExists,
  nicknameChangeStatus,
  nicknameExists,
  normalizeLoginId,
  normalizeNickname,
  verifyCredentials,
  verifyCredentialsById,
  type AuthUser,
} from "@/lib/auth";
import { countGamesByNickname } from "@/lib/games";

export type AuthResult = { error: string } | void;

const LOGIN_ID_RE = /^[A-Za-z0-9_]{3,20}$/;

/** 가입 — id, 비밀번호, 비밀번호 확인, 닉네임(고유). 성공 시 자동 로그인 후 홈으로. */
export async function registerAction(input: {
  loginId: string;
  password: string;
  passwordConfirm: string;
  nickname: string;
}): Promise<AuthResult> {
  const loginId = normalizeLoginId(input.loginId ?? "");
  const nickname = normalizeNickname(input.nickname ?? "");
  const password = input.password ?? "";

  if (!LOGIN_ID_RE.test(loginId))
    return { error: "아이디는 영문/숫자/밑줄 3~20자여야 합니다." };
  if (nickname.length < 1 || nickname.length > 20)
    return { error: "닉네임은 1~20자여야 합니다." };
  if (password.length < 4) return { error: "비밀번호는 4자 이상이어야 합니다." };
  if (password !== input.passwordConfirm) return { error: "비밀번호가 일치하지 않습니다." };
  if (loginIdExists(loginId)) return { error: "이미 사용 중인 아이디입니다." };
  if (nicknameExists(nickname)) return { error: "이미 사용 중인 닉네임입니다." };

  let user: AuthUser;
  try {
    // 가입 = 기본 '플레이어'. 닉네임이 기존 통계의 게스트 닉네임과 같으면 그 기록이 자동 연동된다
    // (통계는 닉네임 문자열로 집계되므로 별도 백필 불필요).
    user = createUser({ loginId, nickname, password });
  } catch {
    // 동시 가입 경합 등 UNIQUE 위반.
    return { error: "이미 사용 중인 아이디 또는 닉네임입니다." };
  }
  await createSession(user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

/** 로그인. */
export async function loginAction(input: {
  loginId: string;
  password: string;
}): Promise<AuthResult> {
  const user = verifyCredentials(input.loginId ?? "", input.password ?? "");
  if (!user) return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  await createSession(user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

/** 로그아웃. */
export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  revalidatePath("/", "layout");
  redirect("/");
}

/** 클라이언트 AuthProvider용 — 현재 사용자 공개 정보(비밀번호 제외) 또는 null. */
export async function meAction(): Promise<Pick<
  AuthUser,
  "id" | "loginId" | "nickname" | "roles"
> | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  return { id: u.id, loginId: u.loginId, nickname: u.nickname, roles: u.roles };
}

export type ChangeNicknameResult =
  | { error: string }
  | { needConfirm: true; newNickname: string; guestGames: number; oldGames: number }
  | { ok: true; nickname: string };

/**
 * 닉네임 변경(본인). 3개월에 1회. 통계·내역은 닉네임 문자열로 매칭되므로 안전장치를 둔다:
 *  - 새 닉네임으로 이미 기록된 게임이 있거나(게스트/타인 기록 흡수 위험),
 *    현재 닉네임으로 집계된 기록이 분리되는 경우 → 건수를 알려주고 confirm=true 재요청 시에만 적용.
 */
export async function changeNicknameAction(input: {
  newNickname: string;
  confirm?: boolean;
}): Promise<ChangeNicknameResult> {
  const u = await getCurrentUser();
  if (!u) return { error: "로그인이 필요합니다." };

  const next = normalizeNickname(input.newNickname ?? "");
  if (next.length < 1 || next.length > 20) return { error: "닉네임은 1~20자여야 합니다." };
  if (next === u.nickname) return { error: "현재 닉네임과 같습니다." };

  const status = nicknameChangeStatus(u);
  if (!status.canChange) {
    const d = status.nextAt ? status.nextAt.slice(0, 10) : "";
    return { error: `닉네임은 3개월에 한 번만 변경할 수 있습니다. 다음 변경 가능일: ${d}` };
  }

  if (nicknameExists(next)) return { error: "이미 사용 중인 닉네임입니다." };

  // 안전장치: 새 닉네임으로 이미 기록된 게임(흡수될 게스트/내역) + 현재 닉네임에서 분리될 기록 확인.
  const guestGames = countGamesByNickname(next);
  const oldGames = countGamesByNickname(u.nickname);
  if ((guestGames > 0 || oldGames > 0) && !input.confirm) {
    return { needConfirm: true, newNickname: next, guestGames, oldGames };
  }

  changeNickname(u.id, next);
  revalidatePath("/", "layout");
  return { ok: true, nickname: next };
}

/** 비밀번호 변경(본인). */
export async function changePasswordAction(input: {
  current: string;
  next: string;
  nextConfirm: string;
}): Promise<{ error: string } | { ok: true }> {
  const u = await getCurrentUser();
  if (!u) return { error: "로그인이 필요합니다." };
  if ((input.next ?? "").length < 4) return { error: "새 비밀번호는 4자 이상이어야 합니다." };
  if (input.next !== input.nextConfirm) return { error: "새 비밀번호가 일치하지 않습니다." };
  if (!verifyCredentialsById(u.id, input.current ?? ""))
    return { error: "현재 비밀번호가 올바르지 않습니다." };
  // changePassword가 이 사용자의 모든 세션(현재 포함)을 폐기하므로, 현재 기기는 새 세션으로 재발급.
  changePassword(u.id, input.next);
  await createSession(u.id);
  return { ok: true };
}
