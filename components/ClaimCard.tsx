"use client";

import { useEffect, useState } from "react";
import type { Character, GamePlayer } from "@/lib/types";
import { RoleCard } from "./RoleCard";

/**
 * 직업 배포용 카드. 점유 후 일정 시간만 보이고, 이후 토큰을 숨긴다.
 * 남의 폰에 몰래 보여주는 걸 막기 위함. 서버도 만료를 강제하므로(새로고침해도 안 보임)
 * 여기 타이머는 새로고침 없이 자동으로 가리기 위한 것.
 */
export function ClaimCard({
  me,
  ch,
  remainingMs,
}: {
  me: GamePlayer;
  ch?: Character;
  remainingMs: number;
}) {
  // 실제 시계 기반 카운트. setInterval로 누적하지 않아 폰 잠금/탭 백그라운드 후에도 정확.
  // mount 시점에 만료 timestamp를 고정하고, 250ms마다 now만 갱신해 left = endTime - now 로 계산.
  const [endTime] = useState(() => Date.now() + Math.max(0, remainingMs));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endTime <= Date.now()) return;
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [endTime]);

  const left = Math.max(0, Math.ceil((endTime - now) / 1000));
  if (left <= 0) return <Expired />;

  return (
    <>
      <div className="mb-3 rounded-lg border px-3 py-2 text-center text-sm font-medium" style={{ borderColor: "#d4a23a66", color: "#d4a23a", background: "#d4a23a14" }}>
        ⏳ {left}초 후 이 화면이 사라집니다 · 지금 본인 직업을 확인하세요
      </div>
      <RoleCard me={me} ch={ch} />
    </>
  );
}

export function Expired() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
      <p className="text-4xl">🔒</p>
      <p className="mt-3 text-lg font-bold">확인 시간이 끝났습니다</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">직업은 더 이상 표시되지 않습니다.</p>
    </div>
  );
}
