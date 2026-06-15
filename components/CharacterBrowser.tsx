"use client";

import { useMemo, useState } from "react";
import { groupByTeam } from "@/lib/grouping";
import { EDITIONS, TEAM_MAP, TEAMS } from "@/lib/constants";
import type { Character, EditionId, Team } from "@/lib/types";
import { CharacterCard } from "./CharacterCard";
import { Pill } from "./Pill";

type EditionFilter = EditionId | "all";
type TeamFilter = Team | "all";

export function CharacterBrowser({ characters }: { characters: Character[] }) {
  const [edition, setEdition] = useState<EditionFilter>("all");
  const [team, setTeam] = useState<TeamFilter>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return characters.filter((c) => {
      if (edition !== "all" && c.edition !== edition) return false;
      if (team !== "all" && c.team !== team) return false;
      if (query) {
        const hay =
          `${c.name.ko} ${c.name.en} ${c.ability.ko} ${c.ability.en}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [edition, team, q]);

  const groups = useMemo(() => groupByTeam(filtered), [filtered]);

  return (
    <div>
      <div className="mb-6 space-y-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="직업 이름 · 능력 검색…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60"
        />

        <div className="flex flex-wrap gap-2">
          <Pill active={edition === "all"} onClick={() => setEdition("all")}>
            전체 에디션
          </Pill>
          {EDITIONS.map((e) => (
            <Pill
              key={e.id}
              active={edition === e.id}
              onClick={() => setEdition(e.id)}
            >
              {e.label.ko}
            </Pill>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill active={team === "all"} onClick={() => setTeam("all")}>
            전체 분류
          </Pill>
          {TEAMS.map((t) => (
            <Pill
              key={t.id}
              active={team === t.id}
              onClick={() => setTeam(t.id)}
              color={t.color}
            >
              {t.label.ko}
            </Pill>
          ))}
        </div>
      </div>

      <p className="mb-4 text-sm text-muted">{filtered.length}개 직업</p>

      {groups.length === 0 ? (
        <p className="py-12 text-center text-muted">조건에 맞는 직업이 없습니다.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const meta = TEAM_MAP[g.team];
            return (
              <section key={g.team}>
                <h2
                  className="mb-3 flex items-center gap-2 text-lg font-semibold"
                  style={{ color: meta.color }}
                >
                  {meta.label.ko}
                  <span className="text-xs font-normal text-muted">
                    {meta.label.en} · {g.items.length}
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
        </div>
      )}
    </div>
  );
}
