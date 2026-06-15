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
        범례
      </button>
    );
  }

  // 원형/사각/수동 어떤 배치든 토큰은 둘레에 있고 가운데는 항상 비므로,
  // 범례를 보드 중앙에 크게 띄운다 — 멀리서도 글자가 읽히게(좌하단 구석은 작아서 안 보였음).
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-h-[62%] w-[min(54%,36rem)] overflow-y-auto rounded-2xl border border-border bg-surface/95 p-5 shadow-2xl backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xl font-bold">범례</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-1 text-lg text-muted hover:bg-surface-2 hover:text-text"
            title="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-x-10 gap-y-5">
          {/* 진영 */}
          <div>
            <p className="mb-2 text-sm font-semibold text-muted">진영 (토큰 테두리·이름 색)</p>
            <div className="flex flex-wrap gap-2">
              {teamsUsed.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-base font-medium"
                  style={{ color: t.color, borderColor: `${t.color}88`, background: `${t.color}1f` }}
                >
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: t.color }} />
                  {t.label.ko}
                </span>
              ))}
            </div>
          </div>

          {/* 마커 */}
          {markerBases.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-muted">상태 마커 (이 게임에 등장)</p>
              <div className="flex flex-col gap-2">
                {markerBases.map((b) => (
                  <span key={b} className="inline-flex items-center gap-2.5">
                    <MarkerToken m={b} charMap={charMap} px={30} />
                    <span className="text-base">{markerInfo(b)?.label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 사망·유령표 */}
          {deaths.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-muted">사망 · 유령표</p>
              <div className="flex flex-col gap-1.5 text-base">
                {hasExecution && <span>☠️ 처형으로 사망</span>}
                {hasNight && <span>🌙 밤에 사망</span>}
                {hasGhostLeft && <span>🗳️ <span className="text-gold">금색</span> = 유령표 남음</span>}
                {hasGhostUsed && <span>🗳️ 흐림 = 유령표 사용함</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
