"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Character, Game } from "@/lib/types";
import { RoleCard } from "./RoleCard";

// 폴링 주기 — interval과 안내 문구가 같은 값을 참조해 드리프트를 막는다.
const POLL_MS = 15000;

/** 폰용 플레이어 뷰 — 자기 자리 직업만 본다(LAN, 신뢰 기반). 주기적 새로고침. */
export function SeatView({ game, sheetChars }: { game: Game; sheetChars: Character[] }) {
  const router = useRouter();
  const [seat, setSeat] = useState<number | null>(null);

  useEffect(() => {
    // iOS 사생활 모드 등에서 localStorage 접근이 throw → try/catch로 보호
    try {
      const s = localStorage.getItem(`botc-seat-${game.id}`);
      if (s !== null) setSeat(Number(s));
    } catch {
      /* ignore */
    }
  }, [game.id]);

  useEffect(() => {
    // 화면이 보일 때만 폴링(15초). 백그라운드 탭이면 멈춰 서버 부하·DB 락 경합 줄임.
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
  const me = game.players.find((p) => p.seat === seat);

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

  // 자리 선택 (서버에서도 렌더 → JS 로딩 전에도 빈 화면이 안 뜬다)
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
        <button type="button" onClick={reset} className="text-xs text-muted hover:text-text">다른 자리</button>
      </div>

      <RoleCard
        me={me}
        ch={charMap[game.disguises?.[me.seat] ?? me.characterId]}
        disguised={!!game.disguises?.[me.seat] && game.disguises[me.seat] !== me.characterId}
      />

      <p className="mt-4 text-center text-[11px] text-muted">{POLL_MS / 1000}초마다 자동 갱신 · 이야기꾼 화면이 아닌 내 정보만 표시됩니다</p>
    </div>
  );
}
