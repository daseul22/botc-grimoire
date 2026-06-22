"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Character, Game } from "@/lib/types";
import { RoleCard } from "./RoleCard";
import { useGameStream } from "./useGameStream";

// SSE가 끊겼을 때를 대비한 보조 폴링 주기(평소엔 SSE로 즉시 갱신되므로 길게).
const POLL_MS = 30000;

/**
 * 폰용 플레이어 뷰 — 자기 자리 직업만 본다. 이야기꾼 변경을 SSE로 즉시 받아 갱신.
 * boundSeat: 온라인 플레이에서 로그인 유저가 좌석에 바인딩된 경우 그 좌석으로 고정(자리 선택 불가).
 *            null이면 게스트(LAN) — 직접 자리를 고른다.
 */
export function SeatView({
  game,
  sheetChars,
  boundSeat = null,
}: {
  game: Game;
  sheetChars: Character[];
  boundSeat?: number | null;
}) {
  const router = useRouter();
  const [seat, setSeat] = useState<number | null>(null);
  const bound = boundSeat != null;
  const effectiveSeat = bound ? boundSeat : seat;

  useEffect(() => {
    // 바인딩 좌석이 있으면 localStorage를 무시(고정 좌석).
    if (bound) return;
    // iOS 사생활 모드 등에서 localStorage 접근이 throw → try/catch로 보호
    try {
      const s = localStorage.getItem(`botc-seat-${game.id}`);
      if (s !== null) setSeat(Number(s));
    } catch {
      /* ignore */
    }
  }, [game.id, bound]);

  // 실시간: 이야기꾼이 게임을 바꾸면 SSE로 즉시 서버 컴포넌트를 다시 그린다.
  // (온라인 좌석 뷰는 서버에서 redactGameForSeat로 본인 좌석만 남겨 보낸다. LAN 게스트 뷰는 신뢰 기반 전체.)
  useGameStream(game.id, () => {
    if (document.visibilityState === "visible") router.refresh();
  });

  useEffect(() => {
    // SSE 실패/끊김 대비 보조 폴링(30초). 화면이 보일 때만 — 백그라운드 탭은 멈춰 부하 절감.
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  const charMap = Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>;
  const me = game.players.find((p) => p.seat === effectiveSeat);

  // setSeat을 먼저 호출해 localStorage가 throw해도 화면 전환은 되게 한다.
  const pick = (s: number) => {
    setSeat(s);
    try {
      localStorage.setItem(`botc-seat-${game.id}`, String(s));
    } catch {
      /* ignore */
    }
  };
  const reset = () => {
    setSeat(null);
    try {
      localStorage.removeItem(`botc-seat-${game.id}`);
    } catch {
      /* ignore */
    }
  };

  // 바인딩 좌석인데 아직 좌석을 못 찾으면(드문 경우) 대기 안내.
  if (!me && bound) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="mb-1 text-xs text-muted">{game.sheetName}</p>
        <p className="text-sm text-muted">좌석을 준비 중입니다…</p>
      </div>
    );
  }
  // 자리 선택 (게스트/LAN — 서버에서도 렌더 → JS 로딩 전에도 빈 화면이 안 뜬다)
  if (!me) {
    return (
      <div className="mx-auto max-w-md">
        <p className="mb-1 text-xs text-muted">{game.sheetName}</p>
        <h1 className="mb-4 text-xl font-bold">자리를 선택하세요</h1>
        <div className="grid grid-cols-2 gap-2">
          {game.players.map((p) => (
            <button key={p.seat} type="button" onClick={() => pick(p.seat)} className="rounded-lg border border-border bg-surface px-3 py-3 text-left text-sm hover:border-gold/60">
              {p.nickname}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted">{game.sheetName} · {game.day}일차 {game.phase === "night" ? "밤" : "낮"}</p>
        {!bound && (
          <button type="button" onClick={reset} className="text-xs text-muted hover:text-text">다른 자리</button>
        )}
      </div>

      <RoleCard
        me={me}
        ch={charMap[game.disguises?.[me.seat] ?? me.characterId]}
        disguised={!!game.disguises?.[me.seat] && game.disguises[me.seat] !== me.characterId}
      />

      <p className="mt-4 text-center text-[11px] text-muted">실시간 자동 갱신 · 이야기꾼 화면이 아닌 내 정보만 표시됩니다</p>
    </div>
  );
}
