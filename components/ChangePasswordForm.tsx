"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "@/app/auth/actions";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [nextConfirm, setNextConfirm] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: boolean }>({});
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg({});
    start(async () => {
      const r = await changePasswordAction({ current, next, nextConfirm });
      if ("error" in r) setMsg({ error: r.error });
      else {
        setMsg({ ok: true });
        setCurrent("");
        setNext("");
        setNextConfirm("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      <input
        className={inputCls}
        type="password"
        placeholder="현재 비밀번호"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
      />
      <input
        className={inputCls}
        type="password"
        placeholder="새 비밀번호 (4자 이상)"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
      />
      <input
        className={inputCls}
        type="password"
        placeholder="새 비밀번호 확인"
        value={nextConfirm}
        onChange={(e) => setNextConfirm(e.target.value)}
        autoComplete="new-password"
      />
      {msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-gold">비밀번호가 변경되었습니다.</p>}
      <button
        type="submit"
        disabled={pending || !current || !next}
        className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-gold/60 disabled:opacity-40"
      >
        {pending ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
