"use client";

import { useEffect, useRef } from "react";

// SSE 구독 훅 — 'update' 이벤트마다 onUpdate 호출. EventSource가 끊김을 자동 재연결한다.
//
// 연결 통합: 같은 URL을 여러 컴포넌트가 구독해도(예: ST play 페이지의 PlayCanvas + DayConsole이
// 같은 /api/games/[id]/stream) EventSource는 URL당 1개만 열고 콜백을 팬아웃한다. 브라우저의
// 호스트당 동시 연결 한계(HTTP/1.1 ~6개)를 아끼고 프로세스 리스너도 줄인다. 마지막 구독자가 떠나면 닫는다.
//
// 재연결 복구: 재연결 시 'open'에서 모든 구독자에게 onUpdate를 1회 발사해 끊긴 동안 놓친 변경을 refetch로
// 따라잡는다(이벤트 버퍼·Last-Event-ID 없음). 최초 open은 스킵(방금 서버 렌더로 최신 상태를 받은 직후라 중복).

type Conn = { es: EventSource; subs: Set<() => void>; opened: boolean };
const conns = new Map<string, Conn>();

function subscribe(url: string, cb: () => void): () => void {
  let c = conns.get(url);
  if (!c) {
    const es = new EventSource(url);
    const conn: Conn = { es, subs: new Set(), opened: false };
    es.addEventListener("update", () => conn.subs.forEach((f) => f()));
    es.addEventListener("open", () => {
      if (conn.opened) conn.subs.forEach((f) => f()); // 재연결 → 전 구독자 refetch
      conn.opened = true;
    });
    conns.set(url, conn);
    c = conn;
  }
  c.subs.add(cb);
  return () => {
    const cc = conns.get(url);
    if (!cc) return;
    cc.subs.delete(cb);
    if (cc.subs.size === 0) {
      cc.es.close();
      conns.delete(url);
    }
  };
}

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
    return subscribe(path, () => cb.current());
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
