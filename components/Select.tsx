"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  /** 우측 보조 설명(예: 직업명). */
  sublabel?: string;
  disabled?: boolean;
};

/**
 * 공통 드롭다운 셀렉터 — native <select> 대체(다크 테마 일관성).
 * 트리거 버튼 + 트리거에 앵커된 portal 팝오버(스크롤 컨테이너에 안 잘림). 바깥클릭·Esc·스크롤로 닫힘.
 * RolePickerModal/PlayerPicker와 같은 톤(border-border·bg-surface·gold 강조).
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = "선택…",
  className = "",
  disabled = false,
  ariaLabel,
}: {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  const openMenu = () => {
    if (disabled) return;
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      // 아래 공간이 부족하고 위가 더 넓으면 위로 펼친다.
      const up = spaceBelow < 240 && r.top > spaceBelow;
      setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onScroll = (e: Event) => {
      // 드롭다운 *내부* 스크롤은 유지하고, 바깥(페이지/컨테이너) 스크롤일 때만 닫는다.
      // (capture라 내부 ul 스크롤도 잡히므로 target이 ul 안이면 무시 — 내부 스크롤 정상 동작.)
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`flex items-center gap-2 rounded-lg border bg-bg px-3 py-2 text-left text-sm outline-none transition-colors ${
          open ? "border-gold/60" : "border-border hover:border-gold/50"
        } disabled:opacity-50 ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-text" : "text-muted"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <div data-modal className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
            <ul
              ref={listRef}
              role="listbox"
              className="absolute max-h-60 overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface py-1 shadow-xl"
              style={{
                left: pos.left,
                minWidth: pos.width,
                ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <li key={String(o.value)}>
                    <button
                      type="button"
                      disabled={o.disabled}
                      role="option"
                      aria-selected={on}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 ${
                        on ? "bg-gold/10 text-gold" : "text-text hover:bg-surface-2"
                      }`}
                    >
                      <span className="w-3.5 shrink-0 text-gold" aria-hidden>
                        {on ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.sublabel && <span className="shrink-0 text-xs text-muted">{o.sublabel}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
