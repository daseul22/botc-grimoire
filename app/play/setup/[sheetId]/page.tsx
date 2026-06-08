import { notFound } from "next/navigation";
import { charactersForSheet, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { SetupStep } from "@/components/SetupStep";

// 커스텀 시트(런타임 데이터)도 시작할 수 있으므로 동적
export const dynamic = "force-dynamic";

export const metadata = { title: "게임 준비" };

export default async function SetupPage({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  const { sheetId } = await params;
  const sheet = getSheet(sheetId) ?? getCustomSheet(sheetId);
  if (!sheet) notFound();

  return (
    <SetupStep
      sheetId={sheet.id}
      sheetName={sheet.name.ko}
      characters={charactersForSheet(sheet)}
    />
  );
}
