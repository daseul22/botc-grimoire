"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { groupByTeam } from "@/lib/grouping";
import { EDITIONS, TEAM_MAP, TEAMS } from "@/lib/constants";
import type { Character, EditionId, Team } from "@/lib/types";
import { CharacterIcon } from "./CharacterIcon";
import { Pill } from "./Pill";
import { createSheetAction, updateSheetAction } from "@/app/sheets/actions";

type EditionFilter = EditionId | "all";
type TeamFilter = Team | "all";

export type SheetBuilderExisting = {
  id: string;
  name: string;
  description: string;
  characterIds: string[];
};

export function SheetBuilder({
  characters,
  existing,
}: {
  characters: Character[];
  existing?: SheetBuilderExisting;
}) {
  const editing = !!existing;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(existing?.characterIds ?? []),
  );
  const [edition, setEdition] = useState<EditionFilter>("all");
  const [team, setTeam] = useState<TeamFilter>("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

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
  }, [characters, edition, team, q]);

  const groups = useMemo(() => groupByTeam(filtered), [filtered]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError(undefined);
    const characterIds = characters
      .filter((c) => selected.has(c.id))
      .map((c) => c.id);
    startTransition(async () => {
      const res = editing
        ? await updateSheetAction(existing.id, { name, description, characterIds })
        : await createSheetAction({ name, description, characterIds });
      if (res?.error) setError(res.error);
    });
  }

  const canSave = name.trim().length > 0 && selected.size > 0 && !pending;

  return (
    <div className="pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {editing ? "시트 수정" : "새 시트 만들기"}
        </h1>
        <Link
          href={editing ? `/sheets/${existing.id}` : "/sheets"}
          className="text-sm text-muted hover:text-text"
        >
          취소
        </Link>
      </div>

      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="시트 이름 (필수)"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none placeholder:text-muted focus:border-gold/60"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명 (선택)"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60"
        />
      </div>

      <div className="mt-5 space-y-3">
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

      <div className="mt-6 space-y-8">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((c) => {
                  const on = selected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={`flex items-start gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                        on
                          ? "border-gold/70 bg-gold/10"
                          : "border-border bg-surface hover:bg-surface-2"
                      }`}
                    >
                      <CharacterIcon character={c} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5">
                          <span className="truncate font-medium">
                            {c.name.ko}
                          </span>
                          <span className="truncate text-xs text-muted">
                            {c.name.en}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                          {c.ability.ko}
                        </span>
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                          on
                            ? "border-gold bg-gold text-bg"
                            : "border-border text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* 하단 고정 액션 바 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[88rem] items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-muted">
            {selected.size}개 직업 선택됨
            {error && <span className="ml-3 text-red-400">{error}</span>}
          </span>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text"
              >
                선택 해제
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
            >
              {pending ? "저장 중…" : editing ? "변경 저장" : "시트 만들기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
