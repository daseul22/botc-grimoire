import { notFound, redirect } from "next/navigation";
import { characters } from "@/lib/data";
import { getCustomCharacter } from "@/lib/custom-characters";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { CharacterBuilder } from "@/components/CharacterBuilder";
import type { CustomCharacterInput } from "@/lib/custom-characters";

export const dynamic = "force-dynamic";
export const metadata = { title: "직업 수정" };

export default async function EditCharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = getCustomCharacter(id);
  if (!c) notFound();

  // 소유자 또는 관리자만 수정 가능(커스텀 시트와 동일 정책).
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user) && c.ownerId !== user.id) redirect("/characters/custom");

  // 저장 모양(Character) → 편집 모양(CustomCharacterInput)으로 되돌린다.
  const input: CustomCharacterInput = {
    nameKo: c.name.ko,
    nameEn: c.name.en === c.name.ko ? "" : c.name.en,
    team: c.team,
    abilityKo: c.ability.ko,
    abilityEn: c.ability.en === c.ability.ko ? "" : c.ability.en,
    firstOrder: c.firstNight?.order ?? null,
    firstReminderKo: c.firstNight?.reminder?.ko ?? "",
    otherOrder: c.otherNight?.order ?? null,
    otherReminderKo: c.otherNight?.reminder?.ko ?? "",
    reminders: c.reminders,
    setup: c.setup,
    setupNoteKo: c.setupNote?.ko ?? "",
    flavorKo: c.flavor?.ko ?? "",
    detailKo: c.detail?.ko ?? "",
    image: c.image,
    behavior: c.behavior ?? {},
  };

  return <CharacterBuilder roster={characters} existing={{ id: c.id, input }} />;
}
