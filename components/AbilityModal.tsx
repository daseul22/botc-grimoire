"use client";

import { EDITION_MAP, TEAM_MAP } from "@/lib/constants";
import type { Character } from "@/lib/types";
import { useBackClose } from "./useBackClose";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 border-t border-border pt-3">
      <h3 className="mb-1.5 text-sm font-semibold text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function AbilityModal({
  character: c,
  onClose,
}: {
  character: Character;
  onClose: () => void;
}) {
  // 마운트 = 열림. 모바일 뒤로가기 → 모달만 닫기
  useBackClose(true, onClose);
  const team = TEAM_MAP[c.team];
  const edition = EDITION_MAP[c.edition];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {c.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.image} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{c.name.ko}</h2>
            <p className="text-sm text-muted">{c.name.en}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              <span
                className="rounded px-1.5 py-0.5 font-medium"
                style={{ background: `${team.color}22`, color: team.color, border: `1px solid ${team.color}55` }}
              >
                {team.label.ko}
              </span>
              <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-muted">
                {edition.label.ko}
              </span>
              {c.setup && <span className="rounded px-1.5 py-0.5 text-gold">⚙ 셋업</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted hover:text-text">
            ✕
          </button>
        </div>

        {c.flavor?.ko && (
          <p className="mt-3 whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-sm italic text-muted">
            {c.flavor.ko}
          </p>
        )}

        <Section title="능력">
          <p className="leading-relaxed">{c.ability.ko}</p>
        </Section>

        {c.detail?.ko && (
          <Section title="상세정보">
            <div className="text-sm text-text/90">
              {c.detail.ko.split(/\n+/).map(
                (p, i) =>
                  p.trim() && (
                    <p key={i} className="mb-2 leading-relaxed">
                      {p}
                    </p>
                  ),
              )}
            </div>
          </Section>
        )}

        {c.howTo && c.howTo.ko.length > 0 && (
          <Section title="운영방식">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text/90">
              {c.howTo.ko.map((s, i) => (
                <li key={i} className="leading-relaxed">
                  {s}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {c.jinxes && c.jinxes.ko.length > 0 && (
          <Section title="🔗 징크스">
            <ul className="space-y-1.5 text-sm">
              {c.jinxes.ko.map((s, i) => {
                const idx = s.indexOf(" : ");
                const head = idx > 0 ? s.slice(0, idx) : "";
                const body = idx > 0 ? s.slice(idx + 3) : s;
                return (
                  <li key={i} className="rounded-lg border border-jinx/30 bg-jinx/10 px-3 py-2 leading-relaxed">
                    {head && <span className="font-semibold text-jinx">{head}</span>}
                    {head && <span className="text-muted"> — </span>}
                    <span className="text-muted">{body}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
