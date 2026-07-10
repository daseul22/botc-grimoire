"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Game } from "@/lib/types";
import type { ChatPolicy } from "@/lib/chat-policy";
import { circlePositions } from "@/lib/seat-layout";
import { NominationArrow } from "./NominationArrow";
import { DayTimers } from "./DayTimers";
import { ChatWidget } from "./ChatWidget";
import { useGameStream } from "./useGameStream";
import { useHeartbeat } from "./useHeartbeat";
import type { NominationView } from "./DayVotePanel";

/**
 * 관전자(좌석 없는 멤버) 읽기전용 뷰 — 이전엔 '자리 정보 없음' 막다른 페이지였다.
 * 공개 정보만: 마스킹 보드(정체는 전부 "?"·생사 글리프), 활성 지목 화살표, 낮 타이머, 채팅 관전(전송 불가).
 * 전달받는 game은 redactGameForSeat(-1)로 전 좌석이 마스킹돼 비밀이 새지 않는다.
 */
export function SpectatorGame({
  game,
  nomination,
  roomId,
  gameId,
  meId,
  members,
  memberColors,
  seatColors,
  chatPolicy,
}: {
  game: Game;
  nomination: NominationView | null;
  roomId: string;
  gameId: string;
  meId: number;
  members: { userId: number; nickname: string }[];
  memberColors: Record<number, string>;
  seatColors: Record<number, string>;
  chatPolicy: ChatPolicy;
}) {
  const router = useRouter();
  useHeartbeat(roomId);
  useGameStream(gameId, () => {
    if (document.visibilityState === "visible") router.refresh();
  });
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [router]);

  const n = game.players.length;
  const fb = circlePositions(n);
  const tokenPx = n > 11 ? 38 : n > 8 ? 44 : 52;
  const INSET = 0.1;
  const posPct = (v: number) => `${(INSET + v * (1 - 2 * INSET)) * 100}%`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 text-center">
        <p className="text-xs text-muted">{game.sheetName}</p>
        <p className="text-sm font-semibold text-gold">관전 중</p>
        <p className="text-xs text-muted">공개 정보(자리·생사·지목)만 보이며, 직업은 드러나지 않습니다.</p>
      </div>
      <DayTimers timers={game.phaseTimers} />
      <div
        className="relative mx-auto aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface"
        style={{ backgroundImage: "radial-gradient(circle, rgba(212,162,58,0.06) 0%, transparent 70%)" }}
      >
        {nomination && (
          <NominationArrow players={game.players} nominator={nomination.nominator} nominee={nomination.nominee} inset={INSET} />
        )}
        {game.players.map((p, i) => {
          const dead = p.status === "dead";
          const x = Number.isFinite(p.x) ? p.x : fb[i]?.x ?? 0.5;
          const y = Number.isFinite(p.y) ? p.y : fb[i]?.y ?? 0.5;
          const deathGlyph = p.deathCause === "execution" ? "☠️" : p.deathCause === "night" ? "🌙" : p.deathCause === "exile" ? "⊘" : "✕";
          return (
            <div
              key={p.seat}
              className="absolute flex flex-col items-center gap-0.5"
              style={{ left: posPct(x), top: posPct(y), transform: "translate(-50%, -50%)" }}
            >
              <div className="relative" style={{ width: tokenPx, height: tokenPx }}>
                <div
                  className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-border bg-bg ${
                    dead ? "opacity-40 grayscale" : ""
                  }`}
                >
                  <span className="font-bold text-muted" style={{ fontSize: tokenPx * 0.42 }}>?</span>
                  {dead && (
                    <span className="absolute inset-0 flex items-center justify-center text-red-500" style={{ fontSize: tokenPx * 0.45 }}>
                      {deathGlyph}
                    </span>
                  )}
                </div>
              </div>
              <span className="pointer-events-none max-w-[4.2rem] truncate text-[10px] font-medium text-text" style={{ color: seatColors[p.seat] }}>
                {p.seat + 1}. {p.nickname}
              </span>
            </div>
          );
        })}
      </div>
      <ChatWidget roomId={roomId} meId={meId} members={members} memberColors={memberColors} policy={chatPolicy} />
    </div>
  );
}
