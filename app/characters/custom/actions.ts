"use server";

import fs from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  clearBehaviorOverride,
  countGamesUsing,
  createCustomCharacter,
  deleteCustomCharacter,
  getCustomCharacterOwner,
  setBehaviorOverride,
  updateCustomCharacter,
  type CustomCharacterInput,
} from "@/lib/custom-characters";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { validateBehavior } from "@/lib/ability-catalog";
import type { CharacterBehavior } from "@/lib/behaviors";

/** 커스텀 직업 수정/삭제 권한: 소유자 본인 또는 관리자(커스텀 시트와 동일 정책). */
async function canEdit(id: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;
  const owner = getCustomCharacterOwner(id);
  return owner != null && owner === user.id;
}

function validate(input: CustomCharacterInput): string | undefined {
  if (!input.nameKo?.trim()) return "직업 이름을 입력하세요.";
  if (!input.team) return "분류(팀)를 선택하세요.";
  if (!input.abilityKo?.trim()) return "능력 설명을 입력하세요.";
  // 밤 순서는 공식 직업 사이에 끼워 넣는 정렬 키다. 음수/과대 값은 순서표를 망가뜨린다.
  for (const o of [input.firstOrder, input.otherOrder])
    if (o != null && (!Number.isInteger(o) || o < 0 || o > 999))
      return "밤 순서는 0~999 사이 정수여야 합니다.";
  // 동작 값은 저장 후 조용히 오작동하는 종류라(지목 칸이 안 뜨는 등) 저장 시점에 막는다.
  return validateBehavior(input.behavior ?? {});
}

export async function createCharacterAction(
  input: CustomCharacterInput,
): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const bad = validate(input);
  if (bad) return { error: bad };

  const id = createCustomCharacter({ ...input, ownerId: user.id });
  revalidatePath("/characters/custom");
  revalidatePath("/sheets/new");
  redirect(`/characters/custom?created=${id}`);
}

export async function updateCharacterAction(
  id: string,
  input: CustomCharacterInput,
): Promise<{ error: string } | void> {
  if (!(await canEdit(id))) return { error: "이 직업을 수정할 권한이 없습니다." };
  const bad = validate(input);
  if (bad) return { error: bad };

  updateCustomCharacter(id, input);
  revalidatePath("/characters/custom");
  revalidatePath(`/characters/${id}`);
  redirect("/characters/custom");
}

export async function deleteCharacterAction(id: string): Promise<{ error: string } | void> {
  if (!(await canEdit(id))) return { error: "이 직업을 삭제할 권한이 없습니다." };

  // 좌석의 character_id는 게임 전역 정체성이라 직업을 지워도 남는다. 정의가 사라지면 그 게임과
  // 복기에서 토큰·이름이 안 그려지고 스펙도 폴백으로 떨어진다 → 과거가 소급 손상되므로 막는다.
  const used = countGamesUsing(id);
  if (used > 0)
    return {
      error: `이 직업이 쓰인 게임이 ${used}개 있어 삭제할 수 없습니다. 지우면 그 게임의 복기가 깨집니다. 시트에서만 빼려면 시트 수정에서 선택 해제하세요.`,
    };

  deleteCustomCharacter(id);
  revalidatePath("/characters/custom");
  revalidatePath("/sheets");
  redirect("/characters/custom");
}

// ── 아이콘 업로드 ──

const ICON_DIR = path.join(process.cwd(), "public", "icons", "custom");
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};
/** 서버 액션 payload 한도를 고려한 상한. 클라에서 256px로 리사이즈해 보내므로 넉넉하다. */
const MAX_BYTES = 512 * 1024;

/**
 * 토큰 이미지를 업로드한다. 클라이언트가 canvas로 256px 정사각 리사이즈한 dataURL을 보낸다.
 * FormData 대신 dataURL을 쓰는 이유: 기존 서버 액션이 전부 평범한 객체 인자를 받는 형태라
 * 호출 패턴을 통일하고, 리사이즈를 클라에서 끝내 서버 의존성(sharp 등)을 늘리지 않기 위해서다.
 */
export async function uploadIconAction(
  dataUrl: string,
): Promise<{ path: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  // dotAll(s) 플래그는 tsconfig target(ES2017)에서 못 쓰므로 [\s\S]로 개행까지 받는다.
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl ?? "");
  if (!m) return { error: "이미지 형식을 읽을 수 없습니다." };
  const ext = MIME_EXT[m[1]];
  if (!ext) return { error: "PNG · WebP · JPEG만 올릴 수 있습니다." };

  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength > MAX_BYTES) return { error: "이미지가 너무 큽니다(512KB 이하)." };

  fs.mkdirSync(ICON_DIR, { recursive: true });
  const name = `${crypto.randomUUID().slice(0, 12)}.${ext}`;
  fs.writeFileSync(path.join(ICON_DIR, name), buf);
  return { path: `/icons/custom/${name}` };
}

// ── 공식 직업 동작 수정(전역 적용) ──

/**
 * 공식 직업의 동작을 덮어쓴다. **모든 게임에 전역 적용**되므로 관리자 전용.
 * 개인 변형이 필요하면 커스텀 직업으로 복제하는 쪽이 안전하다.
 */
export async function setOverrideAction(
  characterId: string,
  behavior: CharacterBehavior,
): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "관리자만 공식 직업 동작을 수정할 수 있습니다." };
  setBehaviorOverride(characterId, behavior);
  revalidatePath(`/characters/${characterId}`);
  revalidatePath("/characters/custom");
}

export async function clearOverrideAction(
  characterId: string,
): Promise<{ error: string } | void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "관리자만 되돌릴 수 있습니다." };
  clearBehaviorOverride(characterId);
  revalidatePath(`/characters/${characterId}`);
  revalidatePath("/characters/custom");
}
