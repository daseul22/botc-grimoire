"use client";

import { useEffect, useState } from "react";

/**
 * 트랜지션 pending을 "지연 반영"해 버튼 깜빡임을 없앤다.
 * 로컬 서버 액션은 보통 수십 ms라, 그 사이 모든 disabled={busy} 버튼이 잠깐 흐려졌다
 * 돌아오며 깜빡인다. active가 delayMs 이상 지속될 때만 true를 반환해, 빠른 액션은
 * 시각적 비활성 전환 없이 지나가고 진짜 느린 액션만 비활성 표시한다.
 * (더블클릭 방지는 시각이 아니라 호출부의 inFlight ref가 담당.)
 */
export function useDelayedFlag(active: boolean, delayMs = 140): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  // active가 풀리면 즉시 false로(다음 렌더). setState-in-effect 회피용 파생.
  if (!active && shown) setShown(false);
  return active && shown;
}
