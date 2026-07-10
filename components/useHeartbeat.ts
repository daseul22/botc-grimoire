"use client";

import { useEffect } from "react";
import { heartbeatRoomAction } from "@/app/rooms/actions";

/**
 * 게임 중 접속 생존 신호 — 탭이 보이는 동안 즉시 1회 + 주기(기본 15초)로 하트비트.
 *
 * 숨겨진(백그라운드) 탭은 신호를 멈춰 프레즌스가 임계(45초) 뒤 오프라인으로 떨어진다(의도된 '자리 비움').
 * 복귀(visible/focus) 시 즉시 재개해 온라인으로 되돌아온다. LAN(roomId 없음)이면 아무것도 안 한다.
 * 하트비트는 emit하지 않으므로(빈번) ST 보드는 getPresenceAction 폴링으로 이 신호를 소비한다.
 */
export function useHeartbeat(roomId: string | undefined, intervalMs = 15000): void {
  useEffect(() => {
    if (!roomId) return;
    if (typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => {
      if (document.visibilityState === "visible") void heartbeatRoomAction(roomId);
    };
    const start = () => {
      beat();
      if (!timer) timer = setInterval(beat, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", start);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", start);
    };
  }, [roomId, intervalMs]);
}
