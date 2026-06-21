"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useAuth } from "./AuthProvider";
import { logoutAction } from "@/app/auth/actions";
import { ROLE_LABEL, type Role } from "@/lib/auth-roles";

const ROLE_CLS: Record<Role, string> = {
  admin: "border-gold/40 bg-gold/10 text-gold",
  storyteller: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  player: "border-border bg-surface-2 text-muted",
};

export function AccountMenu() {
  const { user, loading } = useAuth();
  const [pending, startTransition] = useTransition();

  // 첫 로드 시 깜빡임 최소화 — 로딩 중엔 자리만 차지.
  if (loading) return <div className="ml-auto h-6 w-24" aria-hidden />;

  if (!user) {
    return (
      <div className="ml-auto flex items-center gap-3 text-sm">
        <Link href="/login" className="text-muted transition-colors hover:text-text">
          로그인
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-gold px-3 py-1.5 font-semibold text-bg"
        >
          가입
        </Link>
      </div>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      {user.roles.includes("admin") && (
        <Link href="/admin" className="text-muted transition-colors hover:text-text">
          관리
        </Link>
      )}
      <Link
        href="/account"
        className="flex items-center gap-1.5 text-text transition-colors hover:text-gold"
        title="계정"
      >
        <span className="font-medium">{user.nickname}</span>
        <span className="hidden gap-1 sm:flex">
          {user.roles.map((r) => (
            <span
              key={r}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${ROLE_CLS[r]}`}
            >
              {ROLE_LABEL[r]}
            </span>
          ))}
        </span>
      </Link>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => logoutAction())}
        className="text-muted transition-colors hover:text-red-400 disabled:opacity-50"
      >
        로그아웃
      </button>
    </div>
  );
}
