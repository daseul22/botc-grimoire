"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { TEAM_MAP } from "@/lib/constants";
import { DURATION_LABEL, MARKERS, MARKER_MAP } from "@/lib/markers";
import type { Alignment, Game, Localized, NightAction, Team } from "@/lib/types";
import {
  advancePhaseAction,
  finishGameAction,
  prevPhaseAction,
  redrawAction,
  savePositionsAction,
  setStatusAction,
  toggleLockAction,
  toggleMarkerAction,
} from "@/app/play/actions";

export type CharInfo = {
  name: Localized;
  image?: string;
  team: Team;
  firstNight: NightAction;
  otherNight: NightAction;
};
type CharMap = Record<string, CharInfo>;

const ALIGN_COLOR: Record<Alignment, string> = { good: "#4a90d9", evil: "#d23b3b" };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

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
  const [showOrder, setShowOrder] = useState(true);
  const [pending, startTransition] = useTransition();
  const boardRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ seat: number; sx: number; sy: number; moved: boolean } | null>(
    null,
  );

  const sel = game.players.find((p) => p.seat === selected);
  const night = game.phase === "night";
  const isPast = game.phaseIndex < game.phaseCount - 1;
  const isFirstNight = game.day === 1;
  const nightOrder = night
    ? game.players
        .map((p) => ({
          p,
          na: (isFirstNight
            ? chars[p.characterId]?.firstNight
            : chars[p.characterId]?.otherNight) as NightAction,
        }))
        .filter(
          (x): x is { p: (typeof game.players)[number]; na: NonNullable<NightAction> } =>
            !!x.na,
        )
        .sort((a, b) => a.na.order - b.na.order)
    : [];
  const run = (fn: () => Promise<Game | { error: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) alert(r.error);
      else setGame(r);
    });

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
      {/* 페이즈 헤더 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
            style={{
              background: night ? "#4a90d918" : "#d4a23a18",
              border: `1px solid ${night ? "#4a90d955" : "#d4a23a55"}`,
            }}
          >
            {night ? "🌙" : "☀️"}
          </div>
          <div>
            <p className="text-xs text-muted">{game.sheetName}</p>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">
                {game.day}일차 {night ? "밤" : "낮"}
              </h1>
              <span className="text-xs text-muted">
                스냅샷 {game.phaseIndex + 1}/{game.phaseCount}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              disabled={pending || game.phaseIndex === 0}
              onClick={() => run(() => prevPhaseAction(game.id))}
              className="flex items-center gap-1 px-3 py-2 text-sm text-muted enabled:hover:bg-surface-2 enabled:hover:text-text disabled:opacity-30"
            >
              <Chevron dir="left" /> 이전
            </button>
            <span className="h-6 w-px bg-border" />
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => advancePhaseAction(game.id))}
              className="flex items-center gap-1 bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
            >
              다음 {night ? "낮" : "밤"} <Chevron dir="right" />
            </button>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("직업을 다시 추첨할까요? 현재 진행상황이 모두 초기화됩니다."))
                run(() => redrawAction(game.id));
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            재추첨
          </button>
          <button
            type="button"
            onClick={() => setShowEnd((v) => !v)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text"
          >
            게임 종료
          </button>
          <Link
            href="/games"
            className="rounded-lg px-2 py-2 text-sm text-muted hover:text-text"
          >
            나가기
          </Link>
        </div>
      </div>

      {showEnd && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
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

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {isPast ? (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-medium text-gold">
            과거 페이즈를 보는 중 · 수정 시 이 스냅샷에만 반영
          </span>
        ) : (
          <span>
            토큰 드래그=배치 · 클릭=사망/효과/고정 · 다음 페이즈로 넘기면 일시 효과(중독·보호 등) 자동 소멸
          </span>
        )}
      </div>

      {night && (
        <div className="mb-3 overflow-hidden rounded-lg border border-border bg-surface">
          <button
            type="button"
            onClick={() => setShowOrder((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold"
          >
            <span>
              🌙 {isFirstNight ? "첫째 밤" : "그 외 밤"} 행동 순서
              <span className="ml-1 font-normal text-muted">· {nightOrder.length}</span>
            </span>
            <span className="text-muted">{showOrder ? "▾" : "▸"}</span>
          </button>
          {showOrder &&
            (nightOrder.length === 0 ? (
              <p className="border-t border-border px-4 py-3 text-sm text-muted">
                이 밤에 행동하는 직업이 없습니다.
              </p>
            ) : (
              <ol className="divide-y divide-border border-t border-border">
                {nightOrder.map(({ p, na }, i) => {
                  const ch = chars[p.characterId];
                  const dead = p.status === "dead";
                  return (
                    <li
                      key={p.seat}
                      className={`flex items-center gap-2.5 px-4 py-2 text-sm ${
                        dead ? "opacity-45" : ""
                      }`}
                    >
                      <span className="w-5 shrink-0 text-right tabular-nums text-muted">
                        {i + 1}
                      </span>
                      {ch?.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ch.image}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded-full object-cover"
                        />
                      )}
                      <span className="shrink-0">
                        <span className={`font-medium ${dead ? "line-through" : ""}`}>
                          {p.nickname}
                        </span>
                        <span
                          className="ml-1.5 text-xs"
                          style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}
                        >
                          {ch?.name.ko ?? p.characterId}
                        </span>
                      </span>
                      {na.reminder?.ko && (
                        <span className="truncate text-muted">— {na.reminder.ko}</span>
                      )}
                      {dead && (
                        <span className="ml-auto shrink-0 text-xs text-red-400">사망</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            ))}
        </div>
      )}

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
                <span className="flex max-w-28 flex-wrap justify-center gap-1">
                  {p.markers.map((m) => {
                    const mk = MARKER_MAP[m];
                    return mk?.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={m}
                        src={mk.icon}
                        alt={mk.label}
                        title={mk.label}
                        draggable={false}
                        className="h-9 w-9 rounded-full border bg-bg object-cover shadow"
                        style={{ borderColor: mk.color }}
                      />
                    ) : (
                      <span
                        key={m}
                        title={mk?.label ?? m}
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: mk?.color ?? "#888" }}
                      />
                    );
                  })}
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
                  style={{
                    color: chars[sel.characterId]
                      ? TEAM_MAP[chars[sel.characterId].team]?.color
                      : undefined,
                  }}
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
                onClick={() =>
                  run(() =>
                    setStatusAction(
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
                onClick={() => run(() => toggleLockAction(game.id, sel.seat, !sel.locked))}
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
                    onClick={() => run(() => toggleMarkerAction(game.id, sel.seat, m.id))}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors"
                    style={
                      on
                        ? { background: `${m.color}22`, color: m.color, borderColor: `${m.color}88` }
                        : { borderColor: "var(--color-border)" }
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.icon}
                      alt=""
                      draggable={false}
                      className="h-5 w-5 rounded-full object-cover"
                    />
                    {m.label}
                    <span className="text-[10px] opacity-70">
                      ({DURATION_LABEL[m.duration]})
                    </span>
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
