import { notFound, redirect } from "next/navigation";
import { allCharacters } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { SheetBuilder } from "@/components/SheetBuilder";

// 커스텀 시트만 수정 가능 (가변 데이터 → 항상 최신)
export const dynamic = "force-dynamic";

export const metadata = { title: "시트 수정" };

export default async function EditSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sheet = getCustomSheet(id);
  if (!sheet) notFound();

  // 소유자 또는 관리자만 수정 가능.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user) && sheet.ownerId !== user.id) redirect(`/sheets/${id}`);

  return (
    <SheetBuilder
      characters={allCharacters()}
      existing={{
        id: sheet.id,
        name: sheet.name.ko,
        description: sheet.description?.ko ?? "",
        characterIds: sheet.characterIds,
      }}
    />
  );
}
