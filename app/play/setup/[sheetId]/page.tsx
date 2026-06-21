import { notFound, redirect } from "next/navigation";
import { charactersForSheet, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { listKnownNicknames } from "@/lib/games";
import { getCurrentUser, isStoryteller } from "@/lib/auth";
import { SetupStep } from "@/components/SetupStep";

// 커스텀 시트(런타임 데이터)도 시작할 수 있으므로 동적
export const dynamic = "force-dynamic";

export const metadata = { title: "게임 준비" };

export default async function SetupPage({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  // 게임 시작(준비)은 이야기꾼·관리자만.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStoryteller(user)) redirect("/sheets");

  const { sheetId } = await params;
  const sheet = getSheet(sheetId) ?? getCustomSheet(sheetId);
  if (!sheet) notFound();

  return (
    <SetupStep
      sheetId={sheet.id}
      sheetName={sheet.name.ko}
      characters={charactersForSheet(sheet)}
      knownNicknames={listKnownNicknames().map((k) => k.nickname)}
    />
  );
}
