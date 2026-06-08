import Link from "next/link";
import { TEAM_MAP } from "@/lib/constants";
import { markerInfo, parseMarker } from "@/lib/markers";
import type { HistoryEntry } from "@/lib/games";
import type { Character, Game } from "@/lib/types";

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
        🏁 {resultText}
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
                        {dead && <span className="text-xs text-red-400">사망</span>}
                        {p.markers.map((m) => {
                          const mk = markerInfo(m);
                          const { param } = parseMarker(m);
                          const label =
                            mk?.id === "mad" && param
                              ? `집착·${charMap[param]?.name.ko ?? param}`
                              : mk?.label ?? m;
                          return (
                            <span key={m} className="inline-flex items-center gap-1 rounded px-1 text-[10px]" style={{ background: `${mk?.color ?? "#888"}22`, color: mk?.color ?? "#888" }}>
                              {mk?.icon && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={mk.icon} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                              )}
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
