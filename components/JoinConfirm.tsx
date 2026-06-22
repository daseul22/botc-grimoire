"use client";

import { useState, useTransition } from "react";
import { joinRoomByCodeAction } from "@/app/rooms/actions";

/** 입장 링크에서 방에 참가 확인. 성공 시 액션이 로비로 redirect한다. */
export function JoinConfirm({ code, sheetName }: { code: string; sheetName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="text-center">
      <p className="mb-1 text-xs text-muted">초대된 방</p>
      <h1 className="mb-1 text-2xl font-bold">{sheetName}</h1>
      <p className="mb-6 font-mono tracking-widest text-gold">{code}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const res = await joinRoomByCodeAction(code);
            if (res?.error) setError(res.error);
          });
        }}
        className="rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
      >
        {pending ? "입장 중…" : "이 방에 입장"}
      </button>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
