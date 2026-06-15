import type { ReactNode } from "react";

/** 필터 토글 칩 — 활성 시 색(optional)으로 강조. 브라우즈/통계 화면 공용. */
export function Pill({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? "border-transparent bg-surface-2 text-text"
          : "border-border text-muted hover:text-text"
      }`}
      style={active && color ? { color, borderColor: `${color}88` } : undefined}
    >
      {children}
    </button>
  );
}
