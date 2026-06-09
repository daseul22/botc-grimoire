"use client";

import { useEffect, useState } from "react";

/**
 * 능력 텍스트를 탭하면 풀스크린 큰 글자로 보여준다.
 * 모바일에서 작은 능력문이 잘 안 읽힌다는 피드백 대응.
 */
export function AbilityFocus({ ability, hint }: { ability: string; hint?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl border border-border bg-surface p-4 text-left hover:border-gold/60"
      >
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <span>능력</span>
          <span className="text-[10px] opacity-70">· 탭하여 크게 보기</span>
        </p>
        <p className="text-sm leading-relaxed">{ability}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setOpen(false)}
        >
          <div className="max-w-lg text-center">
            <p className="break-keep text-2xl font-medium leading-relaxed text-text">{ability}</p>
            {hint && <p className="mt-6 text-base text-muted">{hint}</p>}
            <p className="mt-8 text-xs text-muted">탭하여 닫기</p>
          </div>
        </div>
      )}
    </>
  );
}
