"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { loginAction, registerAction } from "@/app/auth/actions";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60";
const labelCls = "mb-1 block text-xs text-muted";

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input className={inputCls} {...props} />
    </label>
  );
}

export function LoginForm() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await loginAction({ loginId, password });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="아이디"
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
        autoComplete="username"
        autoFocus
      />
      <Field
        label="비밀번호"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || !loginId || !password}
        className="w-full rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
      >
        {pending ? "로그인 중…" : "로그인"}
      </button>
      <p className="text-center text-sm text-muted">
        계정이 없나요?{" "}
        <Link href="/register" className="text-gold hover:underline">
          가입하기
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [loginId, setLoginId] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await registerAction({ loginId, nickname, password, passwordConfirm });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="아이디 (영문/숫자/밑줄 3~20자)"
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
        autoComplete="username"
        autoFocus
      />
      <Field
        label="닉네임 (고유 · 통계 집계 기준)"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={20}
      />
      <Field
        label="비밀번호 (4자 이상)"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
      />
      <Field
        label="비밀번호 확인"
        type="password"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
        autoComplete="new-password"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs text-muted">
        이전에 게스트 닉네임으로 플레이한 기록이 있다면, 같은 닉네임으로 가입 시 통계가 자동
        연동됩니다.
      </p>
      <button
        type="submit"
        disabled={pending || !loginId || !nickname || !password}
        className="w-full rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
      >
        {pending ? "가입 중…" : "가입하기"}
      </button>
      <p className="text-center text-sm text-muted">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="text-gold hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
