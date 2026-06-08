"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { TEAM_MAP } from "@/lib/constants";
import type { Alignment, Localized, Team } from "@/lib/types";
import { savePositionsAction } from "@/app/play/actions";

export type PlayToken = {
  seat: number;
  nickname: string;
  characterId: string;
  alignment: Alignment;
  x: number;
  y: number;
  name: Localized;
  image?: string;
  team: Team;
};

const ALIGN_COLOR: Record<Alignment, string> = {
  good: "#4a90d9",
  evil: "#d23b3b",
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function PlayCanvas({
  gameId,
  sheetName,
  players,
}: {
  gameId: string;
  sheetName: string;
  players: PlayToken[];
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragSeat = useRef<number | null>(null);
  const [pos, setPos] = useState<Record<number, { x: number; y: number }>>(() =>
    Object.fromEntries(players.map((p) => [p.seat, { x: p.x, y: p.y }])),
  );

  function pointFromEvent(e: React.PointerEvent) {
    const rect = boardRef.current!.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }

  function onPointerDown(e: React.PointerEvent, seat: number) {
    dragSeat.current = seat;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragSeat.current === null) return;
    const seat = dragSeat.current;
    const p = pointFromEvent(e);
    setPos((prev) => ({ ...prev, [seat]: p }));
  }

  function onPointerUp() {
    const seat = dragSeat.current;
    dragSeat.current = null;
    if (seat === null) return;
    const p = pos[seat];
    if (p) savePositionsAction(gameId, [{ seat, x: p.x, y: p.y }]);
  }

  const evil = players.filter((p) => p.alignment === "evil").length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">진행 단계</p>
          <h1 className="text-xl font-bold">{sheetName}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>
            {players.length}인 · 악 {evil}
          </span>
          <Link href="/sheets" className="hover:text-text">
            나가기
          </Link>
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">
        토큰을 드래그해 자리에 배치하세요. (페이즈 진행 · 사망/효과 처리 등은 추가 예정)
      </p>

      <div
        ref={boardRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative h-[72vh] w-full touch-none overflow-hidden rounded-xl border border-border bg-surface"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(212,162,58,0.06) 0%, transparent 70%)",
        }}
      >
        {players.map((p) => {
          const here = pos[p.seat] ?? { x: p.x, y: p.y };
          const color = ALIGN_COLOR[p.alignment];
          const teamColor = TEAM_MAP[p.team]?.color ?? "#a39bb5";
          return (
            <div
              key={p.seat}
              onPointerDown={(e) => onPointerDown(e, p.seat)}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none flex-col items-center gap-1 active:cursor-grabbing"
              style={{ left: `${here.x * 100}%`, top: `${here.y * 100}%` }}
            >
              <div
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-bg"
                style={{ borderColor: color }}
              >
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image}
                    alt={p.name.ko}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <span style={{ color: teamColor }}>{p.name.en.charAt(0)}</span>
                )}
              </div>
              <span className="max-w-24 truncate text-sm font-medium">
                {p.nickname}
              </span>
              <span
                className="max-w-24 truncate text-xs"
                style={{ color: teamColor }}
              >
                {p.name.ko}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
