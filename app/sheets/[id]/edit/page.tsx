import { notFound } from "next/navigation";
import { characters } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
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

  return (
    <SheetBuilder
      characters={characters}
      existing={{
        id: sheet.id,
        name: sheet.name.ko,
        description: sheet.description?.ko ?? "",
        characterIds: sheet.characterIds,
      }}
    />
  );
}
