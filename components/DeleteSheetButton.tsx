"use client";

import { useTransition } from "react";
import { deleteSheetAction } from "@/app/sheets/actions";

export function DeleteSheetButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("이 커스텀 시트를 삭제할까요?"))
          startTransition(() => deleteSheetAction(id));
      }}
      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
    >
      {pending ? "삭제 중…" : "삭제"}
    </button>
  );
}
