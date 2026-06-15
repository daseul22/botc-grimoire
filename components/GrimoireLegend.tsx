"use client";

import { useState } from "react";
import { TEAMS } from "@/lib/constants";
import { markerInfo, parseMarker } from "@/lib/markers";
import type { Character, Game } from "@/lib/types";
import { MarkerToken } from "./MarkerToken";

/**
 * 전체화면 첩자 그리모어용 범례 오버레이. 토큰 표현만으론 이해 못하는 관전자를 위해
 * "이 화면에 실제로 등장하는" 진영색·마커·사망표시의 의미를 한국어로 풀어 보여준다.
 * 보드(boardRef) 내부에 렌더해야 네이티브 풀스크린에서도 보인다.
 */
export function GrimoireLegend({
  game,
  charMap,
}: {
  game: Game;
  charMap: Record<string, Character>;
}) {
  const [open, setOpen] = useState(false);

  const teamsUsed = TEAMS.filter((t) =>
    game.players.some((p) => charMap[p.characterId]?.team === t.id),
  );
  // 화면에 쓰인 마커를 base별로 1개만 (대표) — 의미 설명이 목적이라 param 인스턴스는 묶는다.
  const markerBases = Array.from(
    new Set(game.players.flatMap((p) => p.markers).map((m) => parseMarker(m).base)),
  ).filter((b) => markerInfo(b));
  const deaths = game.players.filter((p) => p.status === "dead");
  const hasExecution = deaths.some((p) => p.deathCause === "execution");
  const hasNight = deaths.some((p) => p.deathCause === "night");
  const hasGhostLeft = deaths.some((p) => !p.ghostVoteUsed);
  const hasGhostUsed = deaths.some((p) => p.ghostVoteUsed);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/90 px-3 py-1.5 text-sm text-muted backdrop-blur transition-colors hover:bg-surface-2 hover:text-text"
        title="화면 기호 설명 범례 열기"
      >
        📖 범례
      </button>
    );
  }

  return (
    <div className="absolute bottom-2 left-2 z-10 max-h-[80vh] w-72 overflow-y-auto rounded-xl border border-border bg-surface/95 p-3 text-sm shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">📖 범례</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
          title="닫기"
        >
          ✕
        </button>
      </div>

      {/* 진영 */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-semibold text-muted">진영 (토큰 테두리·이름 색)</p>
        <div className="flex flex-wrap gap-1.5">
          {teamsUsed.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              style={{ color: t.color, borderColor: `${t.color}88`, background: `${t.color}1f` }}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              {t.label.ko}
            </span>
          ))}
        </div>
      </div>

      {/* 마커 */}
      {markerBases.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-semibold text-muted">상태 마커 (이 게임에 등장)</p>
          <div className="flex flex-col gap-1.5">
            {markerBases.map((b) => (
              <span key={b} className="inline-flex items-center gap-2">
                <MarkerToken m={b} charMap={charMap} px={22} />
                <span className="text-xs">{markerInfo(b)?.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 사망·유령표 */}
      {deaths.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-muted">사망 · 유령표</p>
          <div className="flex flex-col gap-1 text-xs">
            {hasExecution && <span>☠️ 처형으로 사망</span>}
            {hasNight && <span>🌙 밤에 사망</span>}
            {hasGhostLeft && <span>🗳️ <span className="text-gold">금색</span> = 유령표 남음</span>}
            {hasGhostUsed && <span>🗳️ 흐림 = 유령표 사용함</span>}
          </div>
        </div>
      )}
    </div>
  );
}
