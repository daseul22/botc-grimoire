"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

/** 새 시트 만들기 — 로그인한 사용자에게만 보인다(누구나 본인 시트 생성 가능). */
export function NewSheetButton() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return (
    <Link
      href="/sheets/new"
      className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg"
    >
      + 새 시트 만들기
    </Link>
  );
}
