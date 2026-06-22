"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { DeleteSheetButton } from "./DeleteSheetButton";
import { createRoomAction } from "@/app/rooms/actions";

/**
 * 시트 상세의 액션 버튼 — 권한별 노출.
 *  - 시작하기(현장/LAN): 이야기꾼·관리자
 *  - 온라인 방 만들기(원격): 이야기꾼·관리자
 *  - PNG 내보내기: 누구나(열람·인쇄용)
 *  - 수정/삭제: 커스텀 시트의 소유자 또는 관리자
 * 보안은 서버 액션/setup·edit 페이지에서 별도 검증 — 이건 UI 게이팅.
 */
export function SheetActions({
  sheetId,
  isCustom,
  ownerId,
}: {
  sheetId: string;
  isCustom: boolean;
  ownerId: number | null;
}) {
  const { user, isStoryteller, isAdmin } = useAuth();
  const canEdit = isCustom && !!user && (isAdmin || ownerId === user.id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function createRoom() {
    setError(undefined);
    startTransition(async () => {
      const res = await createRoomAction(sheetId);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      {isStoryteller && (
        <Link
          href={`/play/setup/${sheetId}`}
          className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-bg"
        >
          ▶ 시작하기
        </Link>
      )}
      {isStoryteller && (
        <button
          type="button"
          onClick={createRoom}
          disabled={pending}
          className="rounded-lg border border-gold/60 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
        >
          {pending ? "방 만드는 중…" : "온라인 방 만들기"}
        </button>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
      <Link
        href={`/sheets/${sheetId}/export`}
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        PNG 내보내기
      </Link>
      {canEdit && (
        <div className="flex gap-2">
          <Link
            href={`/sheets/${sheetId}/edit`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            수정
          </Link>
          <DeleteSheetButton id={sheetId} />
        </div>
      )}
    </div>
  );
}
