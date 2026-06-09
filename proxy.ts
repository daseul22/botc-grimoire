import { NextResponse, type NextRequest } from "next/server";

// 직업 배포 링크에서 자리를 점유한 플레이어 폰은 그 claim 페이지에만 갇힌다.
// (직업/시트/내역 등 다른 페이지 접근 차단 — 다른 사람 직업 엿보기 방지.)
// 쿠키 이름 형식: botc-claim-{gameId}. 게임 종료/재추첨 시 서버에서 claim이 리셋되지만
// 이 디바이스 쿠키는 maxAge(12h)나 사용자가 직접 지우기 전까지 유지된다.
const CLAIM_COOKIE_RE = /^botc-claim-(g-[A-Za-z0-9-]+)$/;

export function proxy(request: NextRequest) {
  const claim = request.cookies.getAll().find((c) => CLAIM_COOKIE_RE.test(c.name));
  if (!claim) return NextResponse.next();
  const gameId = CLAIM_COOKIE_RE.exec(claim.name)?.[1];
  if (!gameId) return NextResponse.next();
  const allowed = `/play/${gameId}/claim`;
  if (request.nextUrl.pathname === allowed) return NextResponse.next();
  return NextResponse.redirect(new URL(allowed, request.url));
}

export const config = {
  // 정적 자원(이미지·번들·아이콘)은 통과시킨다.
  matcher: ["/((?!_next/|favicon|icons/).*)"],
};
