"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  acceptInviteAction,
  declineInviteAction,
  joinRoomByCodeAction,
} from "@/app/rooms/actions";

export type RoomCard = {
  id: string;
  code: string;
  sheetName: string;
  status: "lobby" | "started" | "closed";
  memberCount: number;
  ownerNickname: string;
};
export type InviteCard = {
  inviteId: string;
  sheetName: string;
  code: string;
  ownerNickname: string;
};

const STATUS_LABEL: Record<RoomCard["status"], string> = {
  lobby: "대기 중",
  started: "진행 중",
  closed: "종료",
};

export function RoomsHome({
  owned,
  joined,
  invites,
  prefillCode,
  canCreate,
}: {
  owned: RoomCard[];
  joined: RoomCard[];
  invites: InviteCard[];
  prefillCode: string;
  canCreate: boolean;
}) {
  const [code, setCode] = useState(prefillCode);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function join() {
    setError(undefined);
    const c = code.trim();
    if (!c) return;
    startTransition(async () => {
      const res = await joinRoomByCodeAction(c);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <h1 className="mb-1 text-2xl font-bold">온라인 방</h1>
      <p className="mb-6 text-sm text-muted">
        디스코드 등에서 음성으로 진행하며, 그리모어·자리·정보 전달은 여기서 실시간으로.
      </p>

      {/* 코드로 입장 */}
      <section className="mb-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">입장 코드로 참가</h2>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="예: AB3KP9"
            maxLength={8}
            className="w-40 rounded-lg border border-border bg-bg px-3 py-2 font-mono tracking-widest outline-none focus:border-gold/60"
          />
          <button
            type="button"
            onClick={join}
            disabled={pending || !code.trim()}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
          >
            입장
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </section>

      {/* 받은 초대 */}
      {invites.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">받은 초대</h2>
          <ul className="space-y-2">
            {invites.map((inv) => (
              <InviteRow key={inv.inviteId} invite={inv} />
            ))}
          </ul>
        </section>
      )}

      {/* 내가 만든 방 */}
      <RoomList title="내가 만든 방" rooms={owned} empty={
        canCreate
          ? "시트 페이지에서 '온라인 방 만들기'로 새 방을 시작하세요."
          : "이야기꾼 권한이 있어야 방을 만들 수 있습니다."
      } />

      {/* 참가한 방 */}
      <RoomList title="참가한 방" rooms={joined} empty="참가한 방이 없습니다. 위 코드나 초대로 입장하세요." />
    </div>
  );
}

function InviteRow({ invite }: { invite: InviteCard }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<{ error: string } | void>) => {
    setError(undefined);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
    });
  };
  return (
    <li className="flex items-center justify-between rounded-lg border border-gold/40 bg-surface p-3">
      <div>
        <p className="text-sm font-medium">{invite.sheetName}</p>
        <p className="text-xs text-muted">
          {invite.ownerNickname}님의 초대 · 코드 <span className="font-mono">{invite.code}</span>
        </p>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => acceptInviteAction(invite.inviteId))}
          className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
        >
          수락
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => declineInviteAction(invite.inviteId))}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-40"
        >
          거절
        </button>
      </div>
    </li>
  );
}

function RoomList({ title, rooms, empty }: { title: string; rooms: RoomCard[]; empty: string }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>
      {rooms.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.id}>
              <Link
                href={`/rooms/${r.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 transition-colors hover:border-gold/60"
              >
                <div>
                  <p className="text-sm font-medium">{r.sheetName}</p>
                  <p className="text-xs text-muted">
                    {r.ownerNickname} · 인원 {r.memberCount} · 코드 <span className="font-mono">{r.code}</span>
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    r.status === "lobby"
                      ? "bg-gold/15 text-gold"
                      : r.status === "started"
                        ? "bg-green-500/15 text-green-400"
                        : "bg-border text-muted"
                  }`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
