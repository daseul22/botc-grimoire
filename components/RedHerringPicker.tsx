"use client";

import type { Game } from "@/lib/types";

/**
 * 점쟁이 레드헤링 지정 위젯 — 점쟁이에게 악마로 보이는 선한 1명.
 * 좌석 버튼을 클릭하면 그 좌석으로 지정(이동), 현재 지정된 좌석을 다시 클릭하면 해제.
 * 단일 보장(다른 좌석에서 떼고 이동)은 onAssign이 호출하는 setHerringAction이 서버에서 처리한다.
 * NightSidebar(점쟁이 행)와 1일차 밤 셋업 패널에서 같은 컴포넌트를 공유한다.
 */
export function RedHerringPicker({
  game,
  busy,
  onAssign,
  readonly = false,
  className = "",
}: {
  game: Game;
  busy: boolean;
  /** seat 지정/해제. 같은 좌석 재클릭 시 null이 전달돼 해제. */
  onAssign: (seat: number | null) => void;
  readonly?: boolean;
  className?: string;
}) {
  const herringSeat = game.players.find((p) => p.markers.includes("herring"))?.seat ?? null;
  return (
    <div className={`rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-xs ${className}`}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className="font-semibold text-red-300">레드헤링</span>
        <span className="text-muted">
          점쟁이에게 악마로 보이는 선한 1명
          {!readonly && " — 클릭해 지정·이동, 다시 클릭해 해제"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {game.players.map((p) => {
          const on = p.seat === herringSeat;
          return (
            <button
              key={p.seat}
              type="button"
              disabled={busy || readonly}
              onClick={readonly ? undefined : () => onAssign(on ? null : p.seat)}
              className={`rounded px-1.5 py-0.5 ${
                on
                  ? "bg-red-500/30 text-red-100 ring-1 ring-red-400" // 선택 좌석은 readonly에서도 또렷이(누가 레드헤링인지 한눈에)
                  : "bg-surface-2 text-muted enabled:hover:text-text disabled:opacity-50"
              }`}
              title={on ? "클릭해 해제" : `${p.nickname}을(를) 레드헤링으로 지정`}
            >
              {p.nickname}
            </button>
          );
        })}
      </div>
    </div>
  );
}
