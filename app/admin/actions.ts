"use server";

import { revalidatePath } from "next/cache";
import {
  changePassword,
  countAdmins,
  generateTempPassword,
  getUserById,
  requireAdmin,
  setUserRoles,
  type Role,
} from "@/lib/auth";

/** 사용자 역할 교체(관리자 전용). 마지막 관리자의 'admin' 박탈은 막는다. */
export async function setRolesAction(
  userId: number,
  roles: Role[],
): Promise<{ error: string } | { ok: true }> {
  await requireAdmin();
  const target = getUserById(userId);
  if (!target) return { error: "사용자를 찾을 수 없습니다." };

  const wasAdmin = target.roles.includes("admin");
  const willBeAdmin = roles.includes("admin");
  if (wasAdmin && !willBeAdmin && countAdmins() <= 1)
    return { error: "마지막 관리자의 권한은 해제할 수 없습니다." };

  setUserRoles(userId, roles);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * 비밀번호 초기화(관리자 전용) — 임시 8자리 비밀번호를 생성해 대상 사용자에 설정하고, 그 사용자의
 * 모든 세션을 폐기한다(강제 재로그인). 평문 임시 비밀번호는 이 응답에만 1회 반환되고 저장되지 않는다.
 * 본인 초기화는 막는다(자기 세션까지 폐기돼 로그아웃되므로 — /account에서 변경).
 */
export async function resetPasswordAction(
  userId: number,
): Promise<{ error: string } | { password: string; nickname: string; loginId: string }> {
  const admin = await requireAdmin();
  if (userId === admin.id)
    return { error: "본인 비밀번호는 /account에서 변경하세요(초기화 시 로그아웃됩니다)." };
  const target = getUserById(userId);
  if (!target) return { error: "사용자를 찾을 수 없습니다." };
  const password = generateTempPassword(8);
  changePassword(userId, password); // 해싱 저장 + 대상 사용자의 모든 세션 폐기
  return { password, nickname: target.nickname, loginId: target.loginId };
}
