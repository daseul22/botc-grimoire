"use client";

import { useState } from "react";
import { TEAM_MAP, TEAMS } from "@/lib/constants";
import type { Character } from "@/lib/types";
import { useBackClose } from "./useBackClose";

/**
 * 플레이어가 폰에서 직업을 *직접* 골라야 할 때(철학자 등) 보여주는 토큰 그리드.
 * 선택은 클라이언트 로컬 상태일 뿐 — 시각 피드백만. ST는 그 결과를 보고 행동 기록을 별도로 한다.
 * 직업을 누르면 가운데 큰 모달로 확대 표시(진한 배경) — 모바일 뒤로가기로 닫힌다.
 */
export function PickGrid({ chars }: { chars: Character[] }) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const TEAM_ORDER = TEAMS.map((t) => t.id);
  const sorted = [...chars].sort(
    (a, b) =>
      TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) ||
      a.name.ko.localeCompare(b.name.ko, "ko"),
  );

  // 팀별로 그룹
  const groups: Record<string, Character[]> = {};
  for (const c of sorted) (groups[c.team] ??= []).push(c);

  const picked = pickedId ? chars.find((c) => c.id === pickedId) : undefined;
  useBackClose(pickedId != null, () => setPickedId(null));

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
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPickedId(c.id)}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border p-1.5 transition hover:border-gold/50 hover:bg-surface-2"
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
              ))}
            </div>
          </section>
        );
      })}

      {/* 선택한 직업 — 가운데 큰 모달(진한 배경). 배경/닫기/뒤로가기로 닫힘. */}
      {picked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setPickedId(null)}
        >
          <div
            className="flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-full border-4 bg-surface"
              style={{ borderColor: TEAM_MAP[picked.team]?.color }}
            >
              {picked.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picked.image} alt={picked.name.ko} className="h-full w-full object-cover" />
              ) : (
                <span className="text-5xl" style={{ color: TEAM_MAP[picked.team]?.color }}>
                  {picked.name.en.charAt(0)}
                </span>
              )}
            </div>
            <p className="text-3xl font-bold" style={{ color: TEAM_MAP[picked.team]?.color }}>
              {picked.name.ko}
            </p>
            <p className="text-sm text-muted">{picked.name.en}</p>
            <button
              type="button"
              onClick={() => setPickedId(null)}
              className="mt-2 rounded-lg border border-border px-5 py-2 text-sm text-muted hover:text-text"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
