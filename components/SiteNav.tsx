"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { logoutAction } from "@/app/auth/actions";
import { ROLE_LABEL, type Role } from "@/lib/auth-roles";

const NAV = [
  { href: "/", label: "직업" },
  { href: "/sheets", label: "시트" },
  { href: "/games", label: "내역" },
  { href: "/stats", label: "통계" },
  { href: "/rules", label: "규칙" },
  { href: "/guide", label: "온라인 가이드" },
];

const ROLE_CLS: Record<Role, string> = {
  admin: "border-gold/40 bg-gold/10 text-gold",
  storyteller: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  player: "border-border bg-surface-2 text-muted",
};

/**
 * 전역 헤더 내비 + 계정 메뉴(반응형).
 * - 데스크탑(md+): 직업/시트/… 링크 + 계정 영역을 한 줄에 인라인 표시.
 * - 모바일(<md): 헤더는 로고 + 햄버거만. 나머지(내비·계정)는 햄버거 드롭다운으로.
 *   좁은 화면에서 글자가 세로로 쪼개지며 찌부되던 문제를 해결한다.
 */
export function SiteNav() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();

  // 경로가 바뀌면(링크 이동) 드롭다운을 닫는다 — set-state-in-effect 회피용 렌더 중 파생 리셋.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const logout = () => startTransition(() => logoutAction());
  const close = () => setOpen(false);

  // 온라인 플레이('/rooms')는 로그인 유저에게만 노출(미로그인 클릭 시 로그인으로 보내짐).
  const navItems = user
    ? [...NAV.slice(0, 3), { href: "/rooms", label: "온라인" }, ...NAV.slice(3)]
    : NAV;

  // ── 계정 영역 조각(데스크탑 인라인 / 모바일 드롭다운 공용) ──
  const accountInline = loading ? (
    <div className="h-6 w-24" aria-hidden />
  ) : !user ? (
    <>
      <Link href="/login" onClick={close} className="text-muted transition-colors hover:text-text">로그인</Link>
      <Link href="/register" onClick={close} className="rounded-lg bg-gold px-3 py-1.5 font-semibold text-bg">가입</Link>
    </>
  ) : (
    <>
      {user.roles.includes("admin") && (
        <Link href="/admin" onClick={close} className="text-muted transition-colors hover:text-text">관리</Link>
      )}
      <Link href="/account" onClick={close} className="flex items-center gap-1.5 text-text transition-colors hover:text-gold" title="계정">
        <span className="font-medium">{user.nickname}</span>
        <span className="flex gap-1">
          {user.roles.map((r) => (
            <span key={r} className={`rounded-full border px-1.5 py-0.5 text-[10px] ${ROLE_CLS[r]}`}>{ROLE_LABEL[r]}</span>
          ))}
        </span>
      </Link>
      <button type="button" disabled={pending} onClick={logout} className="text-muted transition-colors hover:text-red-400 disabled:opacity-50">로그아웃</button>
    </>
  );

  return (
    <>
      {/* ── 데스크탑(md+) ── */}
      <nav className="ml-2 hidden items-center gap-4 text-sm md:flex">
        {navItems.map((n) => (
          <Link key={n.href} href={n.href} className="text-muted transition-colors hover:text-text">{n.label}</Link>
        ))}
      </nav>
      <div className="ml-auto hidden items-center gap-3 text-sm md:flex">{accountInline}</div>

      {/* ── 모바일(<md): 햄버거 ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:text-text md:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></> : <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>}
        </svg>
      </button>

      {open && (
        <>
          {/* 바깥 클릭 닫기 — 헤더 바 아래 영역만 덮어 햄버거는 계속 누를 수 있게. */}
          <div className="fixed inset-x-0 bottom-0 top-14 z-30 md:hidden" onClick={close} aria-hidden />
          {/* 드롭다운 — sticky 헤더 기준 절대 위치(전체 폭). */}
          <div className="absolute inset-x-0 top-full z-40 border-b border-border bg-surface shadow-xl md:hidden">
            <nav className="mx-auto flex max-w-[88rem] flex-col gap-0.5 px-4 py-2 text-sm">
              {navItems.map((n) => (
                <Link key={n.href} href={n.href} onClick={close} className="rounded-md px-2 py-2 text-muted hover:bg-surface-2 hover:text-text">{n.label}</Link>
              ))}
              <div className="my-1.5 border-t border-border" />
              <div className="flex flex-wrap items-center gap-3 px-2 py-1">{accountInline}</div>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
