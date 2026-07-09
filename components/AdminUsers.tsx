"use client";

import { useState, useTransition } from "react";
import { resetPasswordAction, setRolesAction } from "@/app/admin/actions";
import { ROLE_LABEL, type Role } from "@/lib/auth-roles";

export type AdminUserRow = {
  id: number;
  loginId: string;
  nickname: string;
  roles: Role[];
  createdAt: string;
};

const TOGGLEABLE: Role[] = ["storyteller", "admin"];

function UserRow({ u, selfId }: { u: AdminUserRow; selfId: number }) {
  const [roles, setRoles] = useState<Role[]>(u.roles);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  // 비밀번호 초기화 — 임시 비번은 응답에서만 1회 표시(저장 안 됨).
  const [resetPw, setResetPw] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [resetting, startReset] = useTransition();

  function doReset() {
    if (!confirm(`${u.nickname}의 비밀번호를 임시 8자리로 초기화할까요?\n기존 로그인 세션은 모두 해제됩니다.`)) return;
    setResetErr(undefined);
    setCopied(false);
    setResetPw(null);
    startReset(async () => {
      const r = await resetPasswordAction(u.id);
      if ("error" in r) setResetErr(r.error);
      else setResetPw(r.password);
    });
  }

  function toggle(role: Role) {
    const next = roles.includes(role)
      ? roles.filter((r) => r !== role)
      : [...roles, role];
    if (!next.includes("player")) next.push("player");
    const prev = roles;
    setRoles(next);
    setError(undefined);
    start(async () => {
      const r = await setRolesAction(u.id, next);
      if ("error" in r) {
        setError(r.error);
        setRoles(prev); // 롤백
      }
    });
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 align-top">
        <div className="font-medium">{u.nickname}</div>
        <div className="text-xs text-muted">{u.loginId}</div>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted">
            {ROLE_LABEL.player}
          </span>
          {TOGGLEABLE.map((role) => {
            const on = roles.includes(role);
            return (
              <button
                key={role}
                type="button"
                disabled={pending}
                onClick={() => toggle(role)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${
                  on
                    ? role === "admin"
                      ? "border-gold/50 bg-gold/10 text-gold"
                      : "border-sky-500/50 bg-sky-500/10 text-sky-300"
                    : "border-border bg-transparent text-muted hover:text-text"
                }`}
              >
                {on ? "✓ " : "+ "}
                {ROLE_LABEL[role]}
              </button>
            );
          })}
          {u.id === selfId && <span className="text-xs text-muted">(나)</span>}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        {u.id === selfId ? (
          <span className="text-xs text-muted">본인은 /account에서</span>
        ) : (
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={resetting}
              onClick={doReset}
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-50"
            >
              {resetting ? "초기화 중…" : "비밀번호 초기화"}
            </button>
            {resetErr && <div className="text-xs text-red-400">{resetErr}</div>}
            {resetPw && (
              <div className="rounded-lg border border-gold/40 bg-gold/5 p-2">
                <p className="mb-1 text-[11px] text-muted">임시 비밀번호 (지금만 표시)</p>
                <div className="flex items-center gap-2">
                  <code className="select-all rounded bg-surface px-2 py-1 text-sm font-bold tracking-wider text-gold">
                    {resetPw}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard?.writeText(resetPw).then(() => setCopied(true)).catch(() => {})
                    }
                    className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-text"
                  >
                    {copied ? "복사됨" : "복사"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  전달 후 로그인하면 <b>/account</b>에서 변경하도록 안내하세요.
                </p>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function AdminUsers({
  users,
  selfId,
}: {
  users: AdminUserRow[];
  selfId: number;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">사용자</th>
            <th className="px-3 py-2 text-left font-medium">권한 (클릭하여 변경)</th>
            <th className="px-3 py-2 text-left font-medium">비밀번호</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow key={u.id} u={u} selfId={selfId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
