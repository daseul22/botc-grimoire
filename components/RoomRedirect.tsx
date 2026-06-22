"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 클라이언트 측 라우트 교체. 서버 redirect()는 클라이언트 소프트 네비게이션(프리페치된 Link 클릭)에서
 * 진동하며 무한 리다이렉트를 일으킨다(/rooms/[id] ↔ /play). 시작된 방으로의 이동은 이걸로 우회한다.
 */
export function RoomRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [to, router]);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm text-muted">게임으로 이동 중…</p>
    </div>
  );
}
