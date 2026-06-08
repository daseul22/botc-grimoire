"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { TEAM_MAP } from "@/lib/constants";
import {
  CORE_TEAMS,
  defaultRatio,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ratioTotal,
  type CoreTeam,
  type Ratio,
} from "@/lib/ratio";
import type { Character } from "@/lib/types";
import { CharacterIcon } from "./CharacterIcon";
import { startGameAction } from "@/app/play/actions";

const clampCount = (n: number) =>
  Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n || MIN_PLAYERS));

export function SetupStep({
  sheetId,
  sheetName,
  characters,
}: {
  sheetId: string;
  sheetName: string;
  characters: Character[];
}) {
  const [count, setCount] = useState(7);
  const [counts, setCounts] = useState<Ratio>(defaultRatio(7));
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [nicknames, setNicknames] = useState<string[]>(() =>
    Array.from({ length: 7 }, () => ""),
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  // 핵심 4직업군만 배정 대상
  const coreByTeam = useMemo(() => {
    const m: Record<CoreTeam, Character[]> = {
      townsfolk: [],
      outsider: [],
      minion: [],
      demon: [],
    };
    for (const c of characters)
      if ((CORE_TEAMS as string[]).includes(c.team)) m[c.team as CoreTeam].push(c);
    return m;
  }, [characters]);

  const available = useMemo(() => {
    const a = {} as Record<CoreTeam, number>;
    for (const t of CORE_TEAMS)
      a[t] = coreByTeam[t].filter((c) => !excluded.has(c.id)).length;
    return a;
  }, [coreByTeam, excluded]);

  function applyCount(nRaw: number) {
    const n = clampCount(nRaw);
    setCount(n);
    setCounts(defaultRatio(n));
    setNicknames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ""));
  }

  function setTeamCount(t: CoreTeam, v: number) {
    setCounts((prev) => ({ ...prev, [t]: Math.max(0, v || 0) }));
  }

  const sum = ratioTotal(counts);
  const sumOk = sum === count;
  const enoughChars = CORE_TEAMS.every((t) => counts[t] <= available[t]);
  const canStart = sumOk && enoughChars && !pending;

  function start() {
    setError(undefined);
    startTransition(async () => {
      const res = await startGameAction({
        sheetId,
        excludedIds: [...excluded],
        counts,
        nicknames,
      });
      if (res?.error) setError(res.error);
    });
  }

  function toggleExclude(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="pb-24">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">준비 단계</p>
          <h1 className="text-2xl font-bold">{sheetName}</h1>
        </div>
        <Link
          href={`/sheets/${sheetId}`}
          className="text-sm text-muted hover:text-text"
        >
          취소
        </Link>
      </div>

      {/* 플레이어 수 + 비율 */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-6">
          <label className="text-sm">
            <span className="mb-1 block text-muted">플레이어 수</span>
            <input
              type="number"
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              value={count}
              onChange={(e) => applyCount(Number(e.target.value))}
              className="w-24 rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-gold/60"
            />
          </label>

          <div>
            <div className="mb-1 flex items-center gap-2 text-sm text-muted">
              직업군 비율
              <button
                type="button"
                onClick={() => setCounts(defaultRatio(count))}
                className="rounded border border-border px-2 py-0.5 text-xs hover:text-text"
              >
                자동
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {CORE_TEAMS.map((t) => {
                const meta = TEAM_MAP[t];
                const over = counts[t] > available[t];
                return (
                  <label key={t} className="text-xs">
                    <span className="mb-0.5 block" style={{ color: meta.color }}>
                      {meta.label.ko}
                      <span className="ml-1 text-muted">/{available[t]}</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={counts[t]}
                      onChange={(e) => setTeamCount(t, Number(e.target.value))}
                      className={`w-16 rounded-lg border bg-bg px-2 py-1.5 outline-none ${
                        over ? "border-red-500/70" : "border-border"
                      }`}
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <p className={`text-sm ${sumOk ? "text-muted" : "text-red-400"}`}>
            합계 {sum} / 인원 {count}
          </p>
        </div>
      </section>

      {/* 닉네임 */}
      <section className="mt-5">
        <h2 className="mb-2 text-sm font-semibold text-muted">
          플레이어 닉네임
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {nicknames.map((nick, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-xs text-muted">
                {i + 1}
              </span>
              <input
                value={nick}
                onChange={(e) =>
                  setNicknames((prev) => {
                    const next = prev.slice();
                    next[i] = e.target.value;
                    return next;
                  })
                }
                placeholder={`플레이어 ${i + 1}`}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60"
              />
            </div>
          ))}
        </div>
      </section>

      {/* 제외할 직업 */}
      <section className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-muted">
          제외할 직업 (밸런스)
        </h2>
        <p className="mb-3 text-xs text-muted">
          누르면 이번 게임에서 제외됩니다. 배정은 핵심 4직업군에서만 이루어집니다.
        </p>
        <div className="space-y-5">
          {CORE_TEAMS.map((t) => {
            const meta = TEAM_MAP[t];
            const list = coreByTeam[t];
            if (list.length === 0) return null;
            return (
              <div key={t}>
                <h3 className="mb-2 text-sm font-medium" style={{ color: meta.color }}>
                  {meta.label.ko}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {available[t]}/{list.length}
                  </span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {list.map((c) => {
                    const ex = excluded.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleExclude(c.id)}
                        title={c.ability.ko}
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${
                          ex
                            ? "border-border bg-transparent text-muted line-through opacity-50"
                            : "border-border bg-surface hover:bg-surface-2"
                        }`}
                      >
                        <CharacterIcon character={c} size={18} />
                        {c.name.ko}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 하단 고정 바 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-muted">
            {!sumOk
              ? `비율 합(${sum})과 인원(${count})을 맞추세요`
              : !enoughChars
                ? "직업 수가 부족한 직업군이 있습니다"
                : "준비 완료"}
            {error && <span className="ml-3 text-red-400">{error}</span>}
          </span>
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
          >
            {pending ? "배정 중…" : "게임 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}
