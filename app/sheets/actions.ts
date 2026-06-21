"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createCustomSheet,
  deleteCustomSheet,
  getCustomSheetOwner,
  updateCustomSheet,
} from "@/lib/custom-sheets";
import { getCurrentUser, isAdmin } from "@/lib/auth";

/** 시트 수정/삭제 권한: 소유자 본인 또는 관리자. */
async function canEditSheet(id: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;
  const owner = getCustomSheetOwner(id);
  return owner != null && owner === user.id;
}

export async function createSheetAction(input: {
  name: string;
  description: string;
  characterIds: string[];
}): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const name = input.name?.trim();
  if (!name) return { error: "시트 이름을 입력하세요." };
  if (!input.characterIds?.length)
    return { error: "직업을 1개 이상 선택하세요." };

  const id = createCustomSheet({
    name,
    description: input.description?.trim() || undefined,
    characterIds: input.characterIds,
    ownerId: user.id,
  });
  revalidatePath("/sheets");
  redirect(`/sheets/${id}`);
}

export async function updateSheetAction(
  id: string,
  input: { name: string; description: string; characterIds: string[] },
): Promise<{ error: string } | void> {
  if (!(await canEditSheet(id)))
    return { error: "이 시트를 수정할 권한이 없습니다." };

  const name = input.name?.trim();
  if (!name) return { error: "시트 이름을 입력하세요." };
  if (!input.characterIds?.length)
    return { error: "직업을 1개 이상 선택하세요." };

  updateCustomSheet(id, {
    name,
    description: input.description?.trim() || undefined,
    characterIds: input.characterIds,
  });
  revalidatePath("/sheets");
  revalidatePath(`/sheets/${id}`);
  redirect(`/sheets/${id}`);
}

export async function deleteSheetAction(id: string): Promise<void> {
  if (!(await canEditSheet(id))) throw new Error("이 시트를 삭제할 권한이 없습니다.");
  deleteCustomSheet(id);
  revalidatePath("/sheets");
  revalidatePath(`/sheets/${id}`);
  redirect("/sheets");
}
