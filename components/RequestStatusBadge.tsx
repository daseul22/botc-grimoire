"use client";

import type { NightRequestView } from "./NightRequestPanel";

const BASE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold";

/** 대기 시작 후 경과(분). 라이브 틱은 아니고 리렌더마다 갱신(SSE·프레즌스 폴링 주기면 충분). */
function ageMinutes(iso: string): number {
  const ms = Date.now() - Date.parse(iso);
  return ms > 0 ? Math.floor(ms / 60000) : 0;
}

/**
 * 밤 행동 요청의 전송/확인 상태를 한눈에 보이는 색 뱃지로. 행(NightActionRow)·정보 노드(NightSidebar) 공용.
 * ST가 "내가 보냈는지(전송함·대기)"와 "플레이어가 확인했는지(확인함)"를 색으로 구분할 수 있게 한다.
 * offline=대상 좌석이 접속 끊김 → 응답 대기 상태(선택/확인 대기)면 '오프라인' 칩 + 경과 시간을 덧붙여
 * ST가 '기다리는 중'인지 '폰이 꺼졌는지'를 구분한다(프레즌스 P0-2 위에 얹음).
 */
export function RequestStatusBadge({
  req,
  offline,
}: {
  req: NightRequestView | null | undefined;
  offline?: boolean;
}) {
  if (!req) return null;
  let chip: React.ReactNode = null;
  switch (req.status) {
    case "done":
      chip = <span className={`${BASE} bg-green-500/20 text-green-300 ring-1 ring-green-500/40`}>✓ 확인함</span>;
      break;
    case "delivered":
      chip = <span className={`${BASE} bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40`}>전송함 · 확인 대기</span>;
      break;
    case "responded":
      chip = <span className={`${BASE} bg-gold/20 text-gold ring-1 ring-gold/40`}>응답 옴</span>;
      break;
    case "awaiting":
      chip = <span className={`${BASE} bg-surface-2 text-muted ring-1 ring-border`}>선택 대기 중</span>;
      break;
    default:
      return null;
  }
  // 플레이어 응답을 기다리는 상태에서만 오프라인/경과를 노출(responded·done은 이미 플레이어가 행동함).
  const waiting = req.status === "awaiting" || req.status === "delivered";
  if (!waiting) return chip;
  const mins = ageMinutes(req.createdAt);
  return (
    <span className="inline-flex items-center gap-1">
      {chip}
      {offline && (
        <span className={`${BASE} bg-red-500/15 text-red-300 ring-1 ring-red-500/30`} title="이 좌석이 접속 끊김 — 응답이 안 올 수 있습니다">
          오프라인
        </span>
      )}
      {mins >= 1 && <span className="text-[10px] text-muted">{mins}분째</span>}
    </span>
  );
}
