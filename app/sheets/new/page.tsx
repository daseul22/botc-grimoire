import { redirect } from "next/navigation";
import { characters } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { SheetBuilder } from "@/components/SheetBuilder";

// 로그인 사용자만 시트 생성 → 쿠키 검사로 동적.
export const dynamic = "force-dynamic";
export const metadata = { title: "새 시트 만들기" };

export default async function NewSheetPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <SheetBuilder characters={characters} />;
}
