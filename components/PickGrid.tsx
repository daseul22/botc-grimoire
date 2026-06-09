"use client";

import { useState } from "react";
import { TEAM_MAP, TEAMS } from "@/lib/constants";
import type { Character } from "@/lib/types";

/**
 * 플레이어가 폰에서 직업을 *직접* 골라야 할 때(철학자 등) 보여주는 토큰 그리드.
 * 선택은 클라이언트 로컬 상태일 뿐 — 시각 피드백만. ST는 그 결과를 보고 행동 기록을 별도로 한다.
 */
export function PickGrid({ chars }: { chars: Character[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const TEAM_ORDER = TEAMS.map((t) => t.id);
  const sorted = [...chars].sort(
    (a, b) =>
      TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) ||
      a.name.ko.localeCompare(b.name.ko, "ko"),
  );

  // 팀별로 그룹
  const groups: Record<string, Character[]> = {};
  for (const c of sorted) (groups[c.team] ??= []).push(c);

  return (
    <div className="space-y-6">
      {TEAMS.map((t) => {
        const list = groups[t.id];
        if (!list?.length) return null;
        return (
          <section key={t.id}>
            <h2 className="mb-2 text-sm font-semibold" style={{ color: t.color }}>
              {t.label.ko}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
              {list.map((c) => {
                const on = picked === c.id;
                const dim = picked && !on;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPicked(on ? null : c.id)}
                    className={`group flex flex-col items-center gap-1 rounded-lg border p-1.5 transition ${
                      on
                        ? "scale-110 border-gold bg-gold/10 ring-2 ring-gold"
                        : dim
                          ? "border-border opacity-30"
                          : "border-border hover:border-gold/50 hover:bg-surface-2"
                    }`}
                  >
                    <div
                      className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-bg"
                      style={{ borderColor: TEAM_MAP[c.team]?.color }}
                    >
                      {c.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-base">{c.name.en.charAt(0)}</span>
                      )}
                    </div>
                    <span
                      className="break-keep text-center text-[11px] leading-tight"
                      style={{ color: TEAM_MAP[c.team]?.color }}
                    >
                      {c.name.ko}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {picked && (
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="fixed bottom-4 right-4 rounded-full bg-gold/20 px-4 py-2 text-sm text-gold ring-1 ring-gold/50 hover:bg-gold/30"
        >
          선택 해제
        </button>
      )}
    </div>
  );
}
