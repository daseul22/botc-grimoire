"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { TEAM_MAP, TEAMS } from "@/lib/constants";
import type { Character } from "@/lib/types";
import { useBackClose } from "./useBackClose";

const TEAM_ORDER = TEAMS.map((t) => t.id);

/**
 * 직업 선택 모달 — 토큰(이미지) + 이름 그리드. 드랍다운보다 시인성이 훨씬 좋다.
 * - 집착/직업변경/능력획득 마커 대상 선택
 * - 행동 기록 결과(role kind: 세탁부/사서/수사관/장의사 등)
 */
export function RolePickerModal({
  open,
  title,
  candidates,
  selected,
  onPick,
  onClose,
  clearLabel = "선택 안 함",
}: {
  open: boolean;
  title: string;
  candidates: Character[];
  selected: string;
  onPick: (id: string) => void;
  onClose: () => void;
  clearLabel?: string;
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

  const sorted = [...candidates].sort(
    (a, b) =>
      TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) ||
      a.name.ko.localeCompare(b.name.ko, "ko"),
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text" title="닫기">✕</button>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-4 md:grid-cols-5">
          <button
            type="button"
            onClick={() => {
              onPick("");
              onClose();
            }}
            className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs hover:border-gold/60 ${selected === "" ? "border-gold/60 bg-gold/10" : "border-border bg-surface-2"}`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border text-muted">∅</div>
            <span className="text-muted">{clearLabel}</span>
          </button>
          {sorted.map((c) => {
            const on = selected === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onPick(c.id);
                  onClose();
                }}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs hover:border-gold/60 ${on ? "border-gold/60 bg-gold/10" : "border-border bg-surface-2"}`}
                title={c.ability.ko}
              >
                <div
                  className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 bg-bg"
                  style={{ borderColor: TEAM_MAP[c.team]?.color }}
                >
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt={c.name.ko} className="h-full w-full object-cover" />
                  ) : (
                    <span style={{ color: TEAM_MAP[c.team]?.color }}>{c.name.en.charAt(0)}</span>
                  )}
                </div>
                <span
                  className="line-clamp-2 break-words text-center font-medium"
                  style={{ color: TEAM_MAP[c.team]?.color }}
                >
                  {c.name.ko}
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
