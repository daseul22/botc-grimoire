"use client";

import { useTransition } from "react";
import { deleteGameAction } from "@/app/play/actions";

export function DeleteGameButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm("이 게임 기록을 삭제할까요?"))
          startTransition(() => deleteGameAction(id));
      }}
      className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-red-400 disabled:opacity-50"
    >
      삭제
    </button>
  );
}
