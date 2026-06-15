import Link from "next/link";
import { notFound } from "next/navigation";
import { charactersForSheet, getSheet, sheets } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { groupByTeam } from "@/lib/grouping";
import { TEAM_MAP } from "@/lib/constants";
import { CharacterCard } from "@/components/CharacterCard";
import { NightOrderTable } from "@/components/NightOrderTable";
import { DeleteSheetButton } from "@/components/DeleteSheetButton";

// 공식 시트는 정적 생성, 커스텀 시트(런타임 생성)는 요청 시 동적 렌더
export const dynamicParams = true;

export function generateStaticParams() {
  return sheets.map((s) => ({ id: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = getSheet(id) ?? getCustomSheet(id);
  return { title: s ? `${s.name.ko} — 시트` : "시트" };
}

export default async function SheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sheet = getSheet(id) ?? getCustomSheet(id);
  if (!sheet) notFound();

  const list = charactersForSheet(sheet);
  const groups = groupByTeam(list);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/sheets" className="text-sm text-muted hover:text-text">
          ← 시트 목록
        </Link>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{sheet.name.ko}</h1>
              {sheet.custom && (
                <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  커스텀
                </span>
              )}
            </div>
            {!sheet.custom && <p className="text-muted">{sheet.name.en}</p>}
            {sheet.description && (
              <p className="mt-2 text-sm text-muted">{sheet.description.ko}</p>
            )}
            <p className="mt-2 text-xs text-muted">{list.length}개 직업</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link
              href={`/play/setup/${sheet.id}`}
              className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-bg"
            >
              ▶ 시작하기
            </Link>
            <Link
              href={`/sheets/${sheet.id}/export`}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
            >
              PNG 내보내기
            </Link>
            {sheet.custom && (
              <div className="flex gap-2">
                <Link
                  href={`/sheets/${sheet.id}/edit`}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
                >
                  수정
                </Link>
                <DeleteSheetButton id={sheet.id} />
              </div>
            )}
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted">이 시트에는 직업이 없습니다.</p>
      ) : (
        <>
          {groups.map((g) => {
            const meta = TEAM_MAP[g.team];
            return (
              <section key={g.team}>
                <h2
                  className="mb-3 text-lg font-semibold"
                  style={{ color: meta.color }}
                >
                  {meta.label.ko}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {g.items.length}
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((c) => (
                    <CharacterCard key={c.id} character={c} />
                  ))}
                </div>
              </section>
            );
          })}

          <section className="grid grid-cols-1 gap-8 border-t border-border pt-6 sm:grid-cols-2">
            <div>
              <h2 className="mb-3 text-lg font-semibold">첫날밤 순서</h2>
              <NightOrderTable characters={list} phase="firstNight" />
            </div>
            <div>
              <h2 className="mb-3 text-lg font-semibold">그 외 밤 순서</h2>
              <NightOrderTable characters={list} phase="otherNight" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
