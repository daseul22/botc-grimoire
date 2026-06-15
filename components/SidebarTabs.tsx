"use client";

import type { Game } from "@/lib/types";

export type SidebarKey = "night" | "day" | "abilities" | "claims" | "votes";

const tabClass = (active: boolean) =>
  `rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${
    active ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"
  }`;

/**
 * 사이드바 토글 버튼 묶음. 모바일/데스크탑 두 위치에서 같은 정의를 재사용해
 * 라벨·카운트 배지가 한쪽만 바뀌어 어긋나는 것을 막는다(컨테이너 className만 다름).
 */
export function SidebarTabs({
  game,
  night,
  hasDayRoles,
  active,
  onToggle,
  className,
}: {
  game: Game;
  night: boolean;
  hasDayRoles: boolean;
  active: SidebarKey | null;
  onToggle: (key: SidebarKey) => void;
  className?: string;
}) {
  const bluffCount = game.actions.filter((a) => a.bluff).length;
  const tabs: { key: SidebarKey; label: string; show: boolean }[] = [
    { key: "night", label: "행동 순서", show: night },
    { key: "day", label: "낮 능력", show: !night && hasDayRoles },
    { key: "abilities", label: "상세 능력", show: true },
    { key: "claims", label: `주장${bluffCount > 0 ? ` · ${bluffCount}` : ""}`, show: true },
    { key: "votes", label: `투표${game.votes.length > 0 ? ` · ${game.votes.length}` : ""}`, show: !night },
  ];
  return (
    <div className={className}>
      {tabs
        .filter((t) => t.show)
        .map((t) => (
          <button key={t.key} type="button" onClick={() => onToggle(t.key)} className={tabClass(active === t.key)}>
            {t.label}
          </button>
        ))}
    </div>
  );
}
