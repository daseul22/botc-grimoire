"use client";

import { useMemo } from "react";
import { TEAM_MAP, TEAMS } from "@/lib/constants";
import type { Character, Game } from "@/lib/types";

const TEAM_ORDER = TEAMS.map((t) => t.id);

/** 📖 상세 능력 사이드바 — 인플레이 직업 + 시트의 나머지 직업(흐림). 클릭 → 능력 모달. */
export function AbilitiesSidebar({
  game,
  charMap,
  sheetChars,
  onShowChar,
  onClose,
}: {
  game: Game;
  charMap: Record<string, Character>;
  sheetChars: Character[];
  onShowChar: (c: Character) => void;
  onClose: () => void;
}) {
  const { inPlayRoles, otherRoles } = useMemo(() => {
    const sortFn = (a: Character, b: Character) =>
      TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) ||
      a.name.ko.localeCompare(b.name.ko, "ko");
    const inPlaySet = new Set(game.players.map((p) => p.characterId));
    const seen = new Set<string>();
    const inPlay: Character[] = [];
    for (const p of game.players) {
      const c = charMap[p.characterId];
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        inPlay.push(c);
      }
    }
    const others = sheetChars.filter((c) => !inPlaySet.has(c.id)).slice();
    return { inPlayRoles: inPlay.sort(sortFn), otherRoles: others.sort(sortFn) };
  }, [game.players, charMap, sheetChars]);

  const roleItem = (c: Character, dim: boolean) => (
    <li key={c.id} className={dim ? "opacity-50" : ""}>
      <button
        type="button"
        onClick={() => onShowChar(c)}
        className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
      >
        {c.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium" style={{ color: TEAM_MAP[c.team]?.color }}>
            {c.name.ko}
          </span>
          <span className="block break-words text-xs text-muted">{c.ability.ko}</span>
        </span>
      </button>
    </li>
  );

  return (
    <aside className="flex h-[70vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:w-72">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">
          📖 직업 능력<span className="ml-1 font-normal text-muted">· {inPlayRoles.length}</span>
        </span>
        <button type="button" onClick={onClose} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
      <ul className="flex-1 divide-y divide-border overflow-y-auto">
        {inPlayRoles.map((c) => roleItem(c, false))}
        {otherRoles.length > 0 && (
          <li className="bg-surface-2/40 px-3 py-1.5 text-[11px] font-medium text-muted">
            시트의 다른 직업 (미사용 · {otherRoles.length})
          </li>
        )}
        {otherRoles.map((c) => roleItem(c, true))}
      </ul>
    </aside>
  );
}
