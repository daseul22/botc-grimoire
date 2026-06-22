"use client";

import { useEffect, useRef } from "react";

// SSE 구독 훅 — 'update' 이벤트마다 onUpdate 호출. EventSource가 끊김을 자동 재연결한다.
function useEventStream(path: string | undefined, onUpdate: () => void): void {
  // 최신 콜백을 ref로 들고 있어, onUpdate가 매 렌더 새로 만들어져도 구독을 다시 열지 않는다.
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  useEffect(() => {
    if (!path) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const es = new EventSource(path);
    const handler = () => cb.current();
    es.addEventListener("update", handler);

    return () => {
      es.removeEventListener("update", handler);
      es.close();
    };
  }, [path]);
}

/** 게임 변경 구독(플레이어 폰·이야기꾼 보드). */
export function useGameStream(gameId: string | undefined, onUpdate: () => void): void {
  useEventStream(gameId ? `/api/games/${gameId}/stream` : undefined, onUpdate);
}

/** 룸(로비) 변경 구독 — 멤버 입장·좌석 배정·시작 등. */
export function useRoomStream(roomId: string | undefined, onUpdate: () => void): void {
  useEventStream(roomId ? `/api/rooms/${roomId}/stream` : undefined, onUpdate);
}
