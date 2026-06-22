"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useBackClose } from "./useBackClose";

/**
 * 공통 가운데 모달 — 백드롭 클릭·Esc·모바일 뒤로가기로 닫힌다(일관된 닫기 동작).
 * 내부 패널은 클릭 전파를 막아 내용 클릭으로는 안 닫힘. body로 portal.
 */
export function Modal({
  open,
  onClose,
  children,
  className = "",
  panelClassName = "w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** 내부 패널 클래스(크기/패딩 커스터마이즈). */
  panelClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 모바일/브라우저 뒤로가기 → 닫기.
  useBackClose(open, onClose);

  if (open && typeof document !== "undefined") {
    return createPortal(
      <div
        data-modal
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 ${className}`}
        onClick={onClose}
      >
        <div className={panelClassName} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>,
      document.body,
    );
  }
  return null;
}
