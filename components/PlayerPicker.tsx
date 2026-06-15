"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GamePlayer } from "@/lib/types";
import { useBackClose } from "./useBackClose";

/**
 * 플레이어(좌석) 선택 — 트리거 버튼 + 토큰 그리드 모달. native <select>의 모바일 불편 대체.
 * RolePickerModal과 같은 골격(portal·Escape·뒤로가기 닫기·data-modal)이되 후보가 플레이어다.
 * value=null이면 미선택. allowClear면 '선택 해제' 칸 노출.
 * actionMode=true면 선택 후에도 트리거에 값을 표시하지 않는다(자리 교환처럼 즉시 실행 후 리셋되는 용도).
 */
export function PlayerPicker({
  players,
  value,
  onChange,
  placeholder = "선택…",
  exclude,
  disabled = false,
  allowClear = false,
  clearLabel = "선택 안 함",
  title = "플레이어 선택",
  actionMode = false,
  className = "",
}: {
  players: GamePlayer[];
  value: number | null;
  onChange: (seat: number | null) => void;
  placeholder?: string;
  exclude?: number;
  disabled?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  title?: string;
  actionMode?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const picked = !actionMode && value != null ? players.find((p) => p.seat === value) : undefined;
  const options = players.filter((p) => p.seat !== exclude);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`inline-flex min-w-0 items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-left outline-none hover:border-gold/60 disabled:opacity-60 ${className}`}
      >
        <span className={`truncate ${picked ? "" : "text-muted"}`}>
          {picked ? picked.nickname : placeholder}
        </span>
        <span className="ml-auto shrink-0 text-muted">▾</span>
      </button>
      <PlayerPickerModal
        open={open}
        title={title}
        options={options}
        selected={value}
        allowClear={allowClear}
        clearLabel={clearLabel}
        onPick={(seat) => {
          onChange(seat);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function PlayerPickerModal({
  open,
  title,
  options,
  selected,
  allowClear,
  clearLabel,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  options: GamePlayer[];
  selected: number | null;
  allowClear: boolean;
  clearLabel: string;
  onPick: (seat: number | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 모바일 뒤로가기 → 모달만 닫기
  useBackClose(open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      data-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text" title="닫기">✕</button>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3">
          {allowClear && (
            <button
              type="button"
              onClick={() => onPick(null)}
              className={`flex items-center justify-center gap-1 rounded-lg border p-3 text-sm hover:border-gold/60 ${selected == null ? "border-gold/60 bg-gold/10" : "border-border bg-surface-2"}`}
            >
              <span className="text-muted">{clearLabel}</span>
            </button>
          )}
          {options.map((p) => {
            const on = selected === p.seat;
            const dead = p.status === "dead";
            return (
              <button
                key={p.seat}
                type="button"
                onClick={() => onPick(p.seat)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left hover:border-gold/60 ${on ? "border-gold/60 bg-gold/10" : "border-border bg-surface-2"}`}
              >
                <span className={`text-sm font-medium ${dead ? "text-muted line-through" : ""}`}>
                  {p.nickname}
                </span>
                <span className="text-[11px] text-muted">
                  {p.seat + 1}번{dead ? " · 사망" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
