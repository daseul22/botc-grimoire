import Link from "next/link";
import { charactersForSheet, sheets } from "@/lib/data";
import { listCustomSheets } from "@/lib/custom-sheets";
import type { Sheet } from "@/lib/types";
import { NewSheetButton } from "@/components/NewSheetButton";

// 커스텀 시트는 런타임에 추가되므로 항상 최신 상태를 반영
export const dynamic = "force-dynamic";

export const metadata = { title: "시트 — Sheets" };

const DIFFICULTY: Record<string, string> = {
  beginner: "입문",
  intermediate: "중급",
  advanced: "고급",
};

function SheetCard({ s }: { s: Sheet }) {
  const count = charactersForSheet(s).length;
  return (
    <Link
      href={`/sheets/${s.id}`}
      className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-gold/60 hover:bg-surface-2"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{s.name.ko}</h3>
        {s.difficulty ? (
          <span className="text-xs text-gold">{DIFFICULTY[s.difficulty]}</span>
        ) : s.custom ? (
          <span className="text-xs text-muted">커스텀</span>
        ) : null}
      </div>
      {!s.custom && <p className="text-xs text-muted">{s.name.en}</p>}
      {s.description && (
        <p className="mt-2 text-sm text-muted">{s.description.ko}</p>
      )}
      <p className="mt-3 text-xs text-muted">{count}개 직업</p>
    </Link>
  );
}

export default function SheetsPage() {
  const custom = listCustomSheets();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">
            시트 <span className="text-base font-normal text-muted">Sheets</span>
          </h1>
          <p className="text-sm text-muted">공식 에디션과 직접 만든 커스텀 시트.</p>
        </div>
        <NewSheetButton />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-muted">공식 시트</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s) => (
            <SheetCard key={s.id} s={s} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">
          커스텀 시트{custom.length > 0 && ` · ${custom.length}`}
        </h2>
        {custom.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            아직 만든 커스텀 시트가 없습니다.{" "}
            <Link href="/sheets/new" className="text-gold hover:underline">
              새 시트 만들기
            </Link>
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {custom.map((s) => (
              <SheetCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
