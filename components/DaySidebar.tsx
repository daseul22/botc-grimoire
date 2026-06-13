"use client";

import { TEAM_MAP, TEAMS } from "@/lib/constants";
import { isTainted } from "@/lib/markers";
import { dayActionSpec, INFO_KINDS } from "@/lib/night-actions";
import type { Character, Game } from "@/lib/types";
import { NightActionRow } from "./NightActionRow";
import {
  clearActionAction,
  recordActionAction,
  toggleDoneAction,
} from "@/app/play/actions";

type Run = (fn: () => Promise<Game | { error: string }>) => void;

const TEAM_ORDER = TEAMS.map((t) => t.id);

/** ☀️ 낮 능력 사이드바 — 낮에 쓰는 능력을 가진 인플레이 직업 목록 + 행동 기록. */
export function DaySidebar({
  game,
  charMap,
  busy,
  run,
  onApplyMarker,
  onClose,
}: {
  game: Game;
  charMap: Record<string, Character>;
  busy: boolean;
  run: Run;
  onApplyMarker: (seats: number[], markerStr: string) => void;
  onClose: () => void;
}) {
  const dayRoles = game.players
    .map((p) => ({ p, ch: charMap[p.characterId], spec: dayActionSpec(p.characterId) }))
    .filter(
      (x): x is { p: Game["players"][number]; ch: Character; spec: NonNullable<ReturnType<typeof dayActionSpec>> } =>
        !!x.spec && !!x.ch,
    )
    .sort(
      (a, b) =>
        TEAM_ORDER.indexOf(a.ch.team) - TEAM_ORDER.indexOf(b.ch.team) ||
        a.ch.name.ko.localeCompare(b.ch.name.ko, "ko"),
    );

  return (
    <aside className="flex h-[70vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:w-72">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">
          ☀️ 낮 능력<span className="ml-1 font-normal text-muted">· {dayRoles.length}</span>
        </span>
        <button type="button" onClick={onClose} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
      {dayRoles.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">낮에 쓰는 능력을 가진 직업이 없습니다.</p>
      ) : (
        <ol className="flex-1 divide-y divide-border overflow-y-auto">
          {dayRoles.map(({ p, ch, spec }) => {
            const dead = p.status === "dead";
            const done = game.doneSeats.includes(p.seat);
            // 일회성 사용 여부는 'noability:<직업>' 영구 마커로 판정(직업별). 구버전 bare 'noability'도 호환.
            const usedOnce = !!spec.oncePerGame && p.markers.some((m) => m === "noability" || m === `noability:${p.characterId}`);
            return (
              <li key={p.seat} className={`px-3 py-2 ${dead ? "opacity-45" : ""} ${done ? "opacity-55" : ""}`}>
                <div className="flex items-center gap-2 text-sm">
                  {ch.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                  )}
                  <span className={`font-medium ${dead ? "line-through" : ""}`}>{p.nickname}</span>
                  <span className="text-xs" style={{ color: TEAM_MAP[ch.team]?.color }}>{ch.name.ko}</span>
                  {isTainted(p.markers, game.globalMarkers) && INFO_KINDS.has(spec.result) && <span className="rounded bg-amber-500/20 px-1 text-[10px] font-medium text-amber-400" title="취함/중독 — 거짓 정보를 줘야 합니다">⚠ 거짓</span>}
                  {dead && <span className="text-xs text-red-400">사망</span>}
                  {usedOnce && <span className="rounded bg-surface-2 px-1.5 text-[10px] font-medium text-muted" title="일회성 능력 — 사용 완료(부활 능력으로 되살아나지 않는 한)">능력 사용함</span>}
                  <button type="button" title={done ? "처리 완료 해제" : "처리 완료"} onClick={() => run(() => toggleDoneAction(game.id, p.seat))} className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${done ? "border-green-500 bg-green-500/20 text-green-400" : "border-border text-muted hover:border-green-500/60"}`}>✓</button>
                </div>
                <p className="mt-1 break-words pl-0.5 text-xs text-muted">{ch.ability.ko}</p>
                <NightActionRow
                  actor={p}
                  spec={spec}
                  characterId={p.characterId}
                  players={game.players}
                  charMap={charMap}
                  record={game.actions.find((a) => a.actorSeat === p.seat && a.characterId === p.characterId && !a.bluff)}
                  busy={busy}
                  gameId={game.id}
                  onRecord={(targets, result) => run(() => recordActionAction(game.id, p.seat, p.characterId, targets, result))}
                  onClear={() => run(() => clearActionAction(game.id, p.seat, p.characterId))}
                  onApplyMarker={onApplyMarker}
                />
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
