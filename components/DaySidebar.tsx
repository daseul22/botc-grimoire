"use client";

import { TEAM_MAP, TEAMS } from "@/lib/constants";
import { dayActionSpec, isAbilityUsedUp } from "@/lib/night-actions";
import type { Character, Game, GameActionRun } from "@/lib/types";
import { NightActionRow, type OnlineNightCtx } from "./NightActionRow";
import { TaintWarning } from "./TaintWarning";
import { ActionCardHeader, type HeaderTag } from "./ActionCardHeader";
import {
  clearActionAction,
  recordActionAction,
  toggleDoneAction,
} from "@/app/play/actions";

type Run = GameActionRun;

const TEAM_ORDER = TEAMS.map((t) => t.id);

/** 낮 능력 사이드바 — 낮에 쓰는 능력을 가진 인플레이 직업 목록 + 행동 기록. */
export function DaySidebar({
  game,
  charMap,
  busy,
  run,
  onApplyMarker,
  onClose,
  online,
}: {
  game: Game;
  charMap: Record<string, Character>;
  busy: boolean;
  run: Run;
  onApplyMarker: (seats: number[], markerStr: string) => void;
  onClose: () => void;
  /** 온라인이면 보여주기가 플레이어 폰으로 push된다(LAN이면 undefined). */
  online?: OnlineNightCtx;
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
    <aside className="flex w-full shrink-0 flex-col md:h-[70vh] md:w-72 md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">
          낮 능력<span className="ml-1 font-normal text-muted">· {dayRoles.length}</span>
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
        <ol className="divide-y divide-border md:flex-1 md:overflow-y-auto">
          {dayRoles.map(({ p, ch, spec }) => {
            const dead = p.status === "dead";
            const done = game.doneSeats.includes(p.seat);
            const usedOnce = isAbilityUsedUp(spec.oncePerGame, p.characterId, p.markers);
            // 능력 사용함 = 흐리게 + 자동 ✓. 사망은 흐리지 않는다(사망 시 발동 능력 때문).
            const checked = done || usedOnce;
            const dyingPending = !dead && p.markers.includes("dying");
            const headerTags: HeaderTag[] = [];
            if (dyingPending)
              headerTags.push(
                spec.deathTriggered
                  ? { key: "dying", label: "사망예정 · 능력 발동", title: "오늘 사망 예정 — 사망 시 발동하는 능력이니 지금 처리하세요", tone: "amber" }
                  : { key: "dying", label: "사망예정 · 건너뜀", title: "오늘 사망 예정 — 죽은 것으로 보고 능력 사용을 건너뛰세요", tone: "red" },
              );
            if (dead) headerTags.push({ key: "dead", label: "사망", title: "사망", tone: "red" });
            if (usedOnce) headerTags.push({ key: "used", label: "능력 사용함", title: "일회성 능력 — 사용 완료(부활 능력으로 되살아나지 않는 한)", tone: "muted" });
            return (
              <li key={p.seat} className={`px-3 py-2 ${checked ? "opacity-55" : ""}`}>
                <ActionCardHeader
                  image={ch.image}
                  nickname={p.nickname}
                  roleName={ch.name.ko}
                  roleColor={TEAM_MAP[ch.team]?.color}
                  checked={checked}
                  done={done}
                  onToggleDone={() => run(() => toggleDoneAction(game.id, p.seat))}
                  tags={headerTags}
                  taint={<TaintWarning markers={p.markers} globalMarkers={game.globalMarkers} resultKind={spec.result} info={spec.info} />}
                />
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
                  online={online}
                />
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
