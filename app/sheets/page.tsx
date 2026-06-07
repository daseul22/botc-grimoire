import Link from "next/link";
import { charactersForSheet, sheets } from "@/lib/data";

const DIFFICULTY: Record<string, string> = {
  beginner: "입문",
  intermediate: "중급",
  advanced: "고급",
};

export const metadata = { title: "시트 — Sheets" };

export default function SheetsPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">
        시트 <span className="text-base font-normal text-muted">Sheets</span>
      </h1>
      <p className="mb-6 text-sm text-muted">공식 에디션 시트를 확인하세요.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sheets.map((s) => {
          const count = charactersForSheet(s).length;
          return (
            <Link
              key={s.id}
              href={`/sheets/${s.id}`}
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-gold/60 hover:bg-surface-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">{s.name.ko}</h2>
                {s.difficulty && (
                  <span className="text-xs text-gold">
                    {DIFFICULTY[s.difficulty]}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">{s.name.en}</p>
              {s.description && (
                <p className="mt-2 text-sm text-muted">{s.description.ko}</p>
              )}
              <p className="mt-3 text-xs text-muted">{count}개 직업</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
