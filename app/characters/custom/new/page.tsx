import { redirect } from "next/navigation";
import { characters } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { CharacterBuilder } from "@/components/CharacterBuilder";

// 로그인 사용자만 직업 생성 → 쿠키 검사로 동적.
export const dynamic = "force-dynamic";
export const metadata = { title: "새 직업 만들기" };

export default async function NewCharacterPage() {
  if (!(await getCurrentUser())) redirect("/login");
  // roster는 공식 직업 — 아이콘 빌리기·밤 순서 이웃 안내·미리보기 모의 좌석에 쓴다.
  return <CharacterBuilder roster={characters} />;
}
