"use client";

import { useState, useTransition } from "react";
import { setRolesAction } from "@/app/admin/actions";
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
      <td className="px-3 py-2">
        <div className="font-medium">{u.nickname}</div>
        <div className="text-xs text-muted">{u.loginId}</div>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </td>
      <td className="px-3 py-2">
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
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">사용자</th>
            <th className="px-3 py-2 text-left font-medium">권한 (클릭하여 변경)</th>
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
