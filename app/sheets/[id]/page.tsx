import Link from "next/link";
import { notFound } from "next/navigation";
import { charactersForSheet, getSheet, groupByTeam, sheets } from "@/lib/data";
import { TEAM_MAP } from "@/lib/constants";
import { CharacterCard } from "@/components/CharacterCard";
import { NightOrderTable } from "@/components/NightOrderTable";

export function generateStaticParams() {
  return sheets.map((s) => ({ id: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = getSheet(id);
  return { title: s ? `${s.name.ko} — 시트` : "시트" };
}

export default async function SheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sheet = getSheet(id);
  if (!sheet) notFound();

  const list = charactersForSheet(sheet);
  const groups = groupByTeam(list);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/sheets" className="text-sm text-muted hover:text-text">
          ← 시트 목록
        </Link>
        <h1 className="mt-4 text-2xl font-bold">{sheet.name.ko}</h1>
        <p className="text-muted">{sheet.name.en}</p>
        {sheet.description && (
          <p className="mt-2 text-sm text-muted">{sheet.description.ko}</p>
        )}
      </div>

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
    </div>
  );
}
