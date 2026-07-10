"use client";

import { useEffect, useRef } from "react";

// SSE 구독 훅 — 'update' 이벤트마다 onUpdate 호출. EventSource가 끊김을 자동 재연결한다.
//
// 재연결 복구: EventSource는 끊기면 3초 뒤 자동 재연결하는데, 그 사이 서버가 emit한 'update'는
// 영영 못 받는다(이벤트 버퍼·Last-Event-ID 없음). 그래서 (재)연결이 열릴 때마다 'open'에서 onUpdate를
// 1회 강제 발사해 끊긴 동안 놓친 변경을 refetch로 따라잡는다. 진실원천이 SQLite라 refetch 한 번이면 수렴.
// 최초 연결의 open은 스킵한다 — 페이지가 막 서버 렌더로 최신 상태를 받은 직후라 중복 조회가 되기 때문.
function useEventStream(path: string | undefined, onUpdate: () => void): void {
  // 최신 콜백을 ref로 들고 있어, onUpdate가 매 렌더 새로 만들어져도 구독을 다시 열지 않는다.
  // ref 갱신은 렌더 중이 아니라 effect에서 한다(react-hooks/refs — 렌더 중 ref 접근 금지).
  const cb = useRef(onUpdate);
  useEffect(() => {
    cb.current = onUpdate;
  });

  useEffect(() => {
    if (!path) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const es = new EventSource(path);
    let opened = false; // 최초 open과 재연결 open을 구분.
    const handler = () => cb.current();
    const onOpen = () => {
      if (opened) cb.current(); // 재연결 → 끊긴 동안 놓친 변경을 따라잡음.
      opened = true;
    };
    es.addEventListener("update", handler);
    es.addEventListener("open", onOpen);

    return () => {
      es.removeEventListener("update", handler);
      es.removeEventListener("open", onOpen);
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
