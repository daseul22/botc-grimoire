import Link from "next/link";
import { redirect } from "next/navigation";
import { listCustomCharacters } from "@/lib/custom-characters";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { CustomCharacterList } from "@/components/CustomCharacterList";

// 커스텀 직업은 가변 데이터 → 항상 최신을 읽는다.
export const dynamic = "force-dynamic";
export const metadata = { title: "커스텀 직업" };

export default async function CustomCharactersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // 관리자는 전체, 일반 사용자는 본인이 만든 것만.
  const all = listCustomCharacters();
  const mine = isAdmin(user) ? all : all.filter((c) => c.ownerId === user.id);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">커스텀 직업</h1>
          <p className="mt-1 text-sm text-muted">
            기존 기능(지목 · 결과 · 마커 · 보여주기)을 조합해 직업을 만든다. 만든 직업은 시트에
            넣어 바로 진행할 수 있다.
          </p>
        </div>
        <Link
          href="/characters/custom/new"
          className="shrink-0 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg"
        >
          새 직업
        </Link>
      </div>

      <CustomCharacterList items={mine} />
    </div>
  );
}
