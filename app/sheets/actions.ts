"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createCustomSheet,
  deleteCustomSheet,
  updateCustomSheet,
} from "@/lib/custom-sheets";

export async function createSheetAction(input: {
  name: string;
  description: string;
  characterIds: string[];
}): Promise<{ error: string } | void> {
  const name = input.name?.trim();
  if (!name) return { error: "시트 이름을 입력하세요." };
  if (!input.characterIds?.length)
    return { error: "직업을 1개 이상 선택하세요." };

  const id = createCustomSheet({
    name,
    description: input.description?.trim() || undefined,
    characterIds: input.characterIds,
  });
  revalidatePath("/sheets");
  redirect(`/sheets/${id}`);
}

export async function updateSheetAction(
  id: string,
  input: { name: string; description: string; characterIds: string[] },
): Promise<{ error: string } | void> {
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
  deleteCustomSheet(id);
  revalidatePath("/sheets");
  revalidatePath(`/sheets/${id}`);
  redirect("/sheets");
}
