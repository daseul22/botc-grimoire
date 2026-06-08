"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { TEAM_MAP } from "@/lib/constants";
import { MARKERS, MARKER_MAP } from "@/lib/markers";
import type { Alignment, Game, Localized, Team } from "@/lib/types";
import {
  advancePhaseAction,
  finishGameAction,
  redrawAction,
  savePositionsAction,
  setStatusAction,
  toggleLockAction,
  toggleMarkerAction,
} from "@/app/play/actions";

export type CharInfo = { name: Localized; image?: string; team: Team };
type CharMap = Record<string, CharInfo>;

const ALIGN_COLOR: Record<Alignment, string> = {
  good: "#4a90d9",
  evil: "#d23b3b",
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const phaseLabel = (g: Game) =>
  `${g.day}일차 ${g.phase === "night" ? "밤" : "낮"}`;

export function PlayCanvas({
  game: initial,
  chars,
}: {
  game: Game;
  chars: CharMap;
}) {
  const [game, setGame] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const [pending, startTransition] = useTransition();
  const boardRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ seat: number; sx: number; sy: number; moved: boolean } | null>(
    null,
  );

  const sel = game.players.find((p) => p.seat === selected);

  function patch(g: Game | { error: string }) {
    if ("error" in g) alert(g.error);
    else setGame(g);
  }

  function onDown(e: React.PointerEvent, seat: number) {
    press.current = { seat, sx: e.clientX, sy: e.clientY, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent, locked: boolean) {
    const p = press.current;
    if (!p || locked) return;
    if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 5) return;
    p.moved = true;
    const rect = boardRef.current!.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setGame((g) => ({
      ...g,
      players: g.players.map((pl) => (pl.seat === p.seat ? { ...pl, x, y } : pl)),
    }));
  }
  function onUp() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.moved) {
      const pl = game.players.find((x) => x.seat === p.seat);
      if (pl) savePositionsAction(game.id, [{ seat: p.seat, x: pl.x, y: pl.y }]);
    } else {
      setSelected((s) => (s === p.seat ? null : p.seat));
    }
  }

  return (
    <div className="pb-28">
      {/* 헤더 / 페이즈 컨트롤 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">진행 단계</p>
          <h1 className="text-xl font-bold">
            {game.sheetName}
            <span className="ml-2 rounded-full bg-surface-2 px-2.5 py-0.5 text-sm font-medium text-gold">
              {phaseLabel(game)}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => patch(await advancePhaseAction(game.id)))}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
          >
            {game.phase === "night" ? "→ 낮으로" : "→ 다음 밤"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("직업을 다시 추첨할까요? 현재 진행상황이 초기화됩니다."))
                startTransition(async () => patch(await redrawAction(game.id)));
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            직업 재추첨
          </button>
          <button
            type="button"
            onClick={() => setShowEnd((v) => !v)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text"
          >
            게임 종료
          </button>
          <Link href="/sheets" className="text-sm text-muted hover:text-text">
            나가기
          </Link>
        </div>
      </div>

      {showEnd && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
          <span className="text-sm text-muted">승리 진영:</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => finishGameAction(game.id, "good"))}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: "#4a90d922", color: "#4a90d9" }}
          >
            선 진영 승리
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => finishGameAction(game.id, "evil"))}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: "#d23b3b22", color: "#d23b3b" }}
          >
            악 진영 승리
          </button>
          <button
            type="button"
            onClick={() => setShowEnd(false)}
            className="ml-auto text-sm text-muted hover:text-text"
          >
            취소
          </button>
        </div>
      )}

      <p className="mb-2 text-xs text-muted">
        토큰을 드래그해 배치 · 클릭하면 사망/효과/고정 설정. 다음 페이즈로 넘기면 일시
        효과(중독·보호 등)는 자동으로 사라집니다.
      </p>

      <div
        ref={boardRef}
        className="relative h-[70vh] w-full touch-none overflow-hidden rounded-xl border border-border bg-surface"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(212,162,58,0.06) 0%, transparent 70%)",
        }}
      >
        {game.players.map((p) => {
          const ch = chars[p.characterId];
          const dead = p.status === "dead";
          const teamColor = ch ? TEAM_MAP[ch.team]?.color : "#a39bb5";
          return (
            <div
              key={p.seat}
              onPointerDown={(e) => onDown(e, p.seat)}
              onPointerMove={(e) => onMove(e, p.locked)}
              onPointerUp={onUp}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 touch-none select-none flex-col items-center gap-1 ${
                p.locked ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
              } ${selected === p.seat ? "z-10" : ""}`}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              <div
                className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-bg ${
                  dead ? "opacity-40 grayscale" : ""
                } ${selected === p.seat ? "ring-2 ring-gold ring-offset-2 ring-offset-surface" : ""}`}
                style={{ borderColor: ALIGN_COLOR[p.alignment] }}
              >
                {ch?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ch.image}
                    alt={ch.name.ko}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <span style={{ color: teamColor }}>{ch?.name.en.charAt(0)}</span>
                )}
                {dead && (
                  <span className="absolute inset-0 flex items-center justify-center text-2xl text-red-500">
                    ✕
                  </span>
                )}
                {p.locked && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-surface-2 px-1 text-[10px]">
                    📌
                  </span>
                )}
              </div>
              <span className="max-w-24 truncate text-sm font-medium">
                {p.nickname}
              </span>
              <span className="max-w-24 truncate text-xs" style={{ color: teamColor }}>
                {ch?.name.ko ?? p.characterId}
              </span>
              {p.markers.length > 0 && (
                <span className="flex gap-1">
                  {p.markers.map((m) => (
                    <span
                      key={m}
                      title={MARKER_MAP[m]?.label}
                      className="h-2 w-2 rounded-full"
                      style={{ background: MARKER_MAP[m]?.color ?? "#888" }}
                    />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 선택된 플레이어 컨트롤 */}
      {sel && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">{sel.nickname}</span>
                <span
                  className="ml-2"
                  style={{ color: chars[sel.characterId] ? TEAM_MAP[chars[sel.characterId].team]?.color : undefined }}
                >
                  {chars[sel.characterId]?.name.ko ?? sel.characterId}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm text-muted hover:text-text"
              >
                닫기
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () =>
                  patch(
                    await setStatusAction(
                      game.id,
                      sel.seat,
                      sel.status === "dead" ? "alive" : "dead",
                    ),
                  )
                }
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:text-text"
              >
                {sel.status === "dead" ? "부활" : "사망 처리"}
              </button>
              <button
                type="button"
                onClick={async () =>
                  patch(await toggleLockAction(game.id, sel.seat, !sel.locked))
                }
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:text-text"
              >
                {sel.locked ? "고정 해제" : "위치 고정"}
              </button>
              <span className="mx-1 text-muted">|</span>
              {MARKERS.map((m) => {
                const on = sel.markers.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={async () =>
                      patch(await toggleMarkerAction(game.id, sel.seat, m.id))
                    }
                    className="rounded-full border px-3 py-1 text-sm transition-colors"
                    style={
                      on
                        ? { background: `${m.color}22`, color: m.color, borderColor: `${m.color}88` }
                        : { borderColor: "var(--color-border)" }
                    }
                  >
                    {m.label}
                    {!m.transient && <span className="ml-1 text-[10px]">(유지)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
