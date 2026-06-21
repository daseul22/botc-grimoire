"use server";

import { revalidatePath } from "next/cache";
import {
  countAdmins,
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
