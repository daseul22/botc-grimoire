"use client";

import type { NightRequestView } from "./NightRequestPanel";

/**
 * 밤 행동 요청의 전송/확인 상태를 한눈에 보이는 색 뱃지로. 행(NightActionRow)·정보 노드(NightSidebar) 공용.
 * ST가 "내가 보냈는지(전송함·대기)"와 "플레이어가 확인했는지(확인함)"를 색으로 구분할 수 있게 한다.
 */
export function RequestStatusBadge({ req }: { req: NightRequestView | null | undefined }) {
  if (!req) return null;
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold";
  switch (req.status) {
    case "done":
      return <span className={`${base} bg-green-500/20 text-green-300 ring-1 ring-green-500/40`}>✓ 확인함</span>;
    case "delivered":
      return <span className={`${base} bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40`}>전송함 · 확인 대기</span>;
    case "responded":
      return <span className={`${base} bg-gold/20 text-gold ring-1 ring-gold/40`}>응답 옴</span>;
    case "awaiting":
      return <span className={`${base} bg-surface-2 text-muted ring-1 ring-border`}>선택 대기 중</span>;
    default:
      return null;
  }
}
