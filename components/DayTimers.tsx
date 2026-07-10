"use client";

import { useEffect, useState } from "react";
import type { PhaseTimers } from "@/lib/types";

/**
 * 플레이어용 읽기전용 낮 타이머 — 이야기꾼이 시작한 밀담/공개토론 카운트다운만 표시(제어는 ST).
 * 헤더 바로 아래 sticky pill이라 보드를 가리지 않고 스크롤해도 보인다. 진행 중인 타이머가 없으면 숨는다.
 * startedAt/finishedAt은 서버 Date.now() ms(TimerPanel과 동일 모델). 클라 시계로 남은 시간 계산.
 */
export function DayTimers({ timers }: { timers?: PhaseTimers }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const active = (["whisper", "open", "claim", "rebuttal"] as const).filter(
    (k) => timers?.[k]?.startedAt && !timers[k]!.finishedAt,
  );
  if (active.length === 0) return null;

  const LABEL = { whisper: "밀담", open: "공개토론", claim: "주장", rebuttal: "반론" } as const;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="pointer-events-none sticky top-14 z-10 mb-3 flex justify-center gap-2">
      {active.map((k) => {
        const t = timers![k]!;
        const label = LABEL[k];
        const remaining = Math.max(0, t.durationSec - Math.floor((now - t.startedAt!) / 1000));
        const over = remaining === 0;
        const flashing = over && Math.floor(now / 500) % 2 === 0;
        return (
          <div
            key={k}
            className="flex items-center gap-2 rounded-full border px-3 py-1 shadow-lg backdrop-blur"
            style={{
              borderColor: over ? "#d23b3b" : "var(--color-border)",
              background: flashing ? "#d23b3b22" : "var(--color-surface)",
            }}
          >
            <span className="text-[11px] font-semibold text-muted">{label}</span>
            <span className="font-mono text-sm tabular-nums" style={{ color: over ? "#ff6b6b" : undefined }}>
              {over ? "종료" : fmt(remaining)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
