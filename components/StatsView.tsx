"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Character } from "@/lib/types";
import type { FinishedGame, NicknameStat } from "@/lib/games";
import { CharacterIcon } from "./CharacterIcon";
import { Pill } from "./Pill";

const fmtDate = (iso: string) => iso.slice(0, 10);

function resultChip(result: string | null): { label: string; cls: string } {
  if (result === "good")
    return { label: "선 승리", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
  if (result === "evil")
    return { label: "악 승리", cls: "border-red-500/40 bg-red-500/10 text-red-300" };
  return { label: "결과 없음", cls: "border-border bg-surface-2 text-muted" };
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function StatsView({
  games,
  leaderboard,
  chars,
}: {
  games: FinishedGame[];
  leaderboard: NicknameStat[];
  chars: Record<string, Character>;
}) {
  const [tab, setTab] = useState<"players" | "games">("players");
  const [pq, setPq] = useState("");
  const [gq, setGq] = useState("");
  const [script, setScript] = useState("all");
  const [result, setResult] = useState<"all" | "good" | "evil">("all");

  const roleName = (id: string) => chars[id]?.name.ko ?? id;

  const totals = useMemo(() => {
    const good = games.filter((g) => g.result === "good").length;
    const evil = games.filter((g) => g.result === "evil").length;
    const players = new Set<string>();
    for (const g of games) for (const p of g.players) if (p.nickname.trim()) players.add(p.nickname.trim());
    return { good, evil, total: games.length, players: players.size };
  }, [games]);

  const scripts = useMemo(
    () => Array.from(new Set(games.map((g) => g.sheetName))).sort(),
    [games],
  );

  const filteredPlayers = useMemo(() => {
    const q = pq.trim().toLowerCase();
    return leaderboard.filter((s) => !q || s.nickname.toLowerCase().includes(q));
  }, [leaderboard, pq]);

  const filteredGames = useMemo(() => {
    const q = gq.trim().toLowerCase();
    return games.filter((g) => {
      if (script !== "all" && g.sheetName !== script) return false;
      if (result !== "all" && g.result !== result) return false;
      if (q) {
        const hay = `${g.label} ${g.sheetName} ${g.players.map((p) => p.nickname).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [games, gq, script, result]);

  if (games.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
        아직 종료된 게임이 없습니다. 게임을 끝내면(선/악 승리) 여기에 기록이 쌓입니다.
      </p>
    );
  }

  const winPct = totals.total > 0 ? Math.round((totals.good / totals.total) * 100) : 0;

  return (
    <div>
      {/* 요약 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="종료 게임" value={`${totals.total}`} />
        <StatTile label="선 승리" value={`${totals.good}`} hint={`${winPct}%`} />
        <StatTile label="악 승리" value={`${totals.evil}`} hint={`${100 - winPct}%`} />
        <StatTile label="플레이어" value={`${totals.players}`} hint="누적 닉네임" />
      </div>

      {/* 탭 */}
      <div className="mb-4 flex gap-2">
        <Pill active={tab === "players"} onClick={() => setTab("players")}>
          플레이어 순위
        </Pill>
        <Pill active={tab === "games"} onClick={() => setTab("games")}>
          게임별 기록
        </Pill>
      </div>

      {tab === "players" ? (
        <div>
          <input
            type="search"
            value={pq}
            onChange={(e) => setPq(e.target.value)}
            placeholder="닉네임 검색…"
            className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60 sm:max-w-xs"
          />
          {filteredPlayers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              조건에 맞는 플레이어가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-surface-2 text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">닉네임</th>
                    <th className="px-3 py-2 text-right font-medium">게임</th>
                    <th className="px-3 py-2 text-right font-medium">승</th>
                    <th className="px-3 py-2 text-right font-medium">승률</th>
                    <th className="px-3 py-2 text-center font-medium">진영(선/악)</th>
                    <th className="px-3 py-2 text-left font-medium">자주 한 직업</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((s) => {
                    const pct = s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0;
                    const topRoles = Object.entries(s.roleCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 3);
                    return (
                      <tr key={s.nickname} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {s.nickname}
                            {s.registered ? (
                              <span className="rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-normal text-gold">
                                가입
                              </span>
                            ) : (
                              <span className="rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-normal text-muted">
                                게스트
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.games}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.wins}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gold">{pct}%</td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          <span className="text-sky-300">{s.goodCount}</span>
                          <span className="text-muted"> / </span>
                          <span className="text-red-300">{s.evilCount}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {topRoles.map(([id, n]) => (
                              <span
                                key={id}
                                title={`${roleName(id)} ${n}회`}
                                className="flex items-center gap-1 text-xs text-muted"
                              >
                                {chars[id] && <CharacterIcon character={chars[id]} size={20} />}
                                {roleName(id)}
                                <span className="text-muted/70">×{n}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-3 space-y-2">
            <input
              type="search"
              value={gq}
              onChange={(e) => setGq(e.target.value)}
              placeholder="게임 이름 · 닉네임 검색…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60 sm:max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Pill active={result === "all"} onClick={() => setResult("all")}>
                전체 결과
              </Pill>
              <Pill active={result === "good"} onClick={() => setResult("good")}>
                선 승리
              </Pill>
              <Pill active={result === "evil"} onClick={() => setResult("evil")}>
                악 승리
              </Pill>
            </div>
            {scripts.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <Pill active={script === "all"} onClick={() => setScript("all")}>
                  전체 스크립트
                </Pill>
                {scripts.map((s) => (
                  <Pill key={s} active={script === s} onClick={() => setScript(s)}>
                    {s}
                  </Pill>
                ))}
              </div>
            )}
          </div>

          {filteredGames.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              조건에 맞는 게임이 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredGames.map((g) => {
                const chip = resultChip(g.result);
                const title = g.label.trim() || g.sheetName;
                return (
                  <Link
                    key={g.id}
                    href={`/play/${g.id}`}
                    className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-gold/60 hover:bg-surface-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                      <span className="font-semibold">{title}</span>
                      {g.label.trim() && (
                        <span className="text-xs text-muted">· {g.sheetName}</span>
                      )}
                      <span className="ml-auto text-xs text-muted">
                        {g.players.length}인 · {fmtDate(g.finishedAt)} · 복기 →
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {g.players.map((p) => (
                        <span
                          key={p.seat}
                          title={`${p.nickname} · ${roleName(p.characterId)} · ${
                            p.alignment === "good" ? "선" : "악"
                          }팀 · ${p.won ? "승" : "패"}`}
                          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                            p.won
                              ? "border-gold/40 bg-gold/5"
                              : "border-border bg-surface-2/50 opacity-70"
                          }`}
                        >
                          {chars[p.characterId] && (
                            <CharacterIcon character={chars[p.characterId]} size={20} />
                          )}
                          <span className="font-medium">{p.nickname}</span>
                          <span
                            className={p.alignment === "good" ? "text-sky-300" : "text-red-300"}
                          >
                            {roleName(p.characterId)}
                          </span>
                          <span className={p.won ? "text-gold" : "text-muted"}>
                            {p.won ? "✓" : "✗"}
                          </span>
                        </span>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
