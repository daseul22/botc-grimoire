import Link from "next/link";
import { TEAM_MAP } from "@/lib/constants";
import { markerInfo, markerLabel } from "@/lib/markers";
import { formatResult, specForPhase } from "@/lib/night-actions";
import { useCharacterBehaviors } from "./useBehaviors";
import { MarkerToken } from "./MarkerToken";
import type { HistoryEntry } from "@/lib/games";
import type { Character, Game } from "@/lib/types";

const CAUSE_LABEL: Record<string, string> = { execution: "처형", night: "밤 살해", other: "기타" };

const phaseLabel = (day: number, phase: string | null) =>
  `${day}일차 ${phase === "night" ? "밤" : phase === "day" ? "낮" : ""}`;

export function GameReplay({
  game,
  history,
  sheetChars,
}: {
  game: Game;
  history: HistoryEntry[];
  sheetChars: Character[];
}) {
  // 복기도 기록 해석에 스펙이 필요하다(결과 종류·보여주기) — 커스텀 동작을 먼저 주입.
  useCharacterBehaviors(sheetChars);
  const charMap = Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<
    string,
    Character
  >;
  const resultText =
    game.result === "good"
      ? "선 진영 승리"
      : game.result === "evil"
        ? "악 진영 승리"
        : "게임 종료";
  const resultColor = game.result === "evil" ? "#d23b3b" : "#4a90d9";

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">복기</p>
          <h1 className="text-xl font-bold">{game.sheetName}</h1>
        </div>
        <Link href="/games" className="text-sm text-muted hover:text-text">
          게임 목록
        </Link>
      </div>

      <div
        className="mb-6 rounded-lg border px-4 py-3 text-lg font-bold"
        style={{ borderColor: `${resultColor}66`, background: `${resultColor}14`, color: resultColor }}
      >
        {resultText}
      </div>

      {/* 최종 직업 공개 */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-muted">최종 직업</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {game.players.map((p) => {
            const ch = charMap[p.characterId];
            const color = ch ? TEAM_MAP[ch.team]?.color : "#a39bb5";
            return (
              <div key={p.seat} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <span className={p.status === "dead" ? "text-muted line-through" : ""}>{p.nickname}</span>
                <span style={{ color }}>{ch?.name.ko ?? p.characterId}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 악마 블러핑 */}
      {game.bluffs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">악마 블러핑</h2>
          <div className="flex flex-wrap gap-2">
            {game.bluffs.map((id) => {
              const ch = charMap[id];
              return (
                <span key={id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}>
                  {ch?.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.image} alt="" className="h-5 w-5 rounded-full object-cover" />
                  )}
                  {ch?.name.ko ?? id}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* 진행 기록 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">진행 기록</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">기록된 페이즈가 없습니다.</p>
        ) : (
          <ol className="space-y-4">
            {history.map((h) => (
              <li key={h.idx} className="rounded-lg border border-border bg-surface p-3">
                <p className="mb-2 text-sm font-semibold text-gold">{phaseLabel(h.day, h.phase)}</p>
                <div className="space-y-1 text-sm">
                  {h.players.map((p) => {
                    const ch = charMap[p.characterId];
                    const dead = p.status === "dead";
                    return (
                      <div key={p.seat} className="flex flex-wrap items-center gap-2">
                        <span className={dead ? "text-muted line-through" : ""}>{p.nickname}</span>
                        <span className="text-xs text-muted">{ch?.name.ko ?? p.characterId}</span>
                        {dead && <span className="text-xs text-red-400">사망{p.deathCause ? ` · ${CAUSE_LABEL[p.deathCause] ?? p.deathCause}` : ""}</span>}
                        {p.markers.map((m) => {
                          const mk = markerInfo(m);
                          return (
                            <span key={m} className="inline-flex items-center gap-1 rounded px-1 text-[10px]" style={{ background: `${mk?.color ?? "#888"}22`, color: mk?.color ?? "#888" }}>
                              <MarkerToken m={m} charMap={charMap} px={16} />
                              {markerLabel(m, charMap)}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {h.actions.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border pt-2">
                    <p className="text-[11px] font-medium text-muted">행동 기록</p>
                    {h.actions.map((a) => {
                      const actor = h.players.find((p) => p.seat === a.actorSeat);
                      const ch = charMap[a.characterId];
                      const res = formatResult(specForPhase(a.characterId, h.phase, h.day).result, a.result, charMap);
                      const tnames = a.targets
                        .map((s) => h.players.find((p) => p.seat === s)?.nickname ?? `${s}`)
                        .join(", ");
                      return (
                        <div key={(a.bluff ? "b" : "a") + a.actorSeat + a.characterId} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-medium">{actor?.nickname ?? a.actorSeat}</span>
                          {a.bluff && <span className="rounded bg-surface-2 px-1 text-[10px] text-muted">주장</span>}
                          <span className="text-muted">{ch?.name.ko ?? a.characterId}</span>
                          {a.targets.length > 0 && <span className="text-muted">→ {tnames}</span>}
                          {res && <span className="font-semibold text-gold">＝ {res}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {h.votes.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border pt-2">
                    <p className="text-[11px] font-medium text-muted">지목·투표</p>
                    {h.votes.map((v) => {
                      const nom = h.players.find((p) => p.seat === v.nominator)?.nickname ?? `${v.nominator}`;
                      const nee = h.players.find((p) => p.seat === v.nominee)?.nickname ?? `${v.nominee}`;
                      const voterNames = v.voters?.map((s) => h.players.find((p) => p.seat === s)?.nickname ?? `${s + 1}`) ?? [];
                      return (
                        <div key={v.nominee} className="text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{nom}</span>
                            <span className="text-muted">→ {nee}</span>
                            <span className="font-semibold text-gold">{v.votes}표</span>
                            {v.executed && <span className="rounded bg-red-500/20 px-1 text-[10px] font-semibold text-red-400">처형</span>}
                          </div>
                          {voterNames.length > 0 && (
                            <p className="mt-0.5 break-words pl-1 text-[11px] text-muted">찬성: {voterNames.join(", ")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {(h.timers?.whisper || h.timers?.open) && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[11px] text-muted">
                    {(["whisper", "open"] as const).map((k) => {
                      const t = h.timers?.[k];
                      if (!t) return null;
                      const label = k === "whisper" ? "밀담" : "공개토론";
                      const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
                      const used =
                        t.startedAt != null
                          ? Math.floor(((t.finishedAt ?? t.startedAt) - t.startedAt) / 1000)
                          : 0;
                      return (
                        <span key={k} className="inline-flex items-center gap-1">
                          <span className="font-medium text-text">{label}</span>
                          <span className="tabular-nums">설정 {fmt(t.durationSec)}</span>
                          {t.startedAt != null && <span className="tabular-nums">· 실제 {fmt(used)}</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
