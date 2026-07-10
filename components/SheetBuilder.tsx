"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { groupByTeam } from "@/lib/grouping";
import { EDITIONS, TEAM_MAP, TEAMS } from "@/lib/constants";
import type { Character, EditionId, Team } from "@/lib/types";
import { CharacterIcon } from "./CharacterIcon";
import { Pill } from "./Pill";
import { parseScriptJson, type ScriptImportResult } from "@/lib/script-import";
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

  // 공식 스크립트 JSON 가져오기 — 붙여넣기/파일로 직업 목록을 채운다.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importInfo, setImportInfo] = useState<ScriptImportResult | null>(null);

  function doImport() {
    const res = parseScriptJson(importText, characters);
    setImportInfo(res);
    if (res.error || res.matched.length === 0) return;
    setSelected(new Set(res.matched));
    if (res.name && !name.trim()) setName(res.name);
  }

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

        {/* 공식 스크립트 JSON 가져오기 — script.bloodontheclocktower.com에서 내보낸 JSON을 붙여넣거나 파일 선택 */}
        <div className="rounded-lg border border-border bg-surface-2/40">
          <button
            type="button"
            onClick={() => setImportOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted hover:text-text"
          >
            <span>공식 스크립트 JSON 가져오기</span>
            <span className="text-xs">{importOpen ? "▲" : "▼"}</span>
          </button>
          {importOpen && (
            <div className="space-y-2 border-t border-border px-3 py-2.5">
              <p className="text-xs text-muted">
                script.bloodontheclocktower.com에서 내보낸 JSON을 붙여넣으세요. 알려진 공식 직업만 매칭되고, 이 앱에 없는
                홈브루 직업은 건너뜁니다.
              </p>
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setImportText(String(reader.result ?? ""));
                  reader.readAsText(file);
                }}
                className="block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-surface file:px-2 file:py-1 file:text-xs file:text-text"
              />
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='[{"id":"_meta","name":"..."}, "washerwoman", ...]'
                rows={4}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs outline-none placeholder:text-muted focus:border-gold/60"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={doImport}
                  disabled={!importText.trim()}
                  className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
                >
                  가져오기
                </button>
                {importInfo &&
                  (importInfo.error ? (
                    <span className="text-xs text-red-400">{importInfo.error}</span>
                  ) : (
                    <span className="text-xs text-muted">
                      {importInfo.matched.length}개 매칭
                      {importInfo.unknown.length > 0 && (
                        <span className="text-amber-400">
                          {" "}· 미지원 {importInfo.unknown.length}개({importInfo.unknown.slice(0, 5).join(", ")}
                          {importInfo.unknown.length > 5 ? " …" : ""})
                        </span>
                      )}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
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
