import { NextResponse, type NextRequest } from "next/server";

// 직업 배포 링크에서 자리를 점유한 플레이어 폰은 *어떤 게임의 claim 페이지*에만 갇힌다.
// (직업/시트/내역 등 다른 페이지 접근 차단 — 다른 사람 직업 엿보기 방지.)
// 쿠키 이름 형식: botc-claim-{gameId}. 새 게임이 시작되면 그 게임의 claim 페이지는
// 옛 쿠키와 무관하게 접근 가능해야 한다(새 쿠키 발급 받으면 됨).
const CLAIM_COOKIE_RE = /^botc-claim-(g-[A-Za-z0-9-]+)$/;
const CLAIM_PATH_RE = /^\/play\/(g-[A-Za-z0-9-]+)\/claim/;

export function proxy(request: NextRequest) {
  const claims = request.cookies.getAll().filter((c) => CLAIM_COOKIE_RE.test(c.name));
  if (claims.length === 0) return NextResponse.next();
  // 어떤 게임의 claim 페이지든 접근 허용 — 새 게임 사이클에 다시 자리 잡을 수 있어야 한다.
  if (CLAIM_PATH_RE.test(request.nextUrl.pathname)) return NextResponse.next();
  // 그 외 path는 가장 최근 발급된 claim 쿠키의 게임 claim으로 보낸다.
  const last = claims[claims.length - 1];
  const gameId = CLAIM_COOKIE_RE.exec(last.name)?.[1];
  if (!gameId) return NextResponse.next();
  return NextResponse.redirect(new URL(`/play/${gameId}/claim`, request.url));
}

export const config = {
  // 정적 자원(이미지·번들·아이콘)과 API/SSE 라우트는 통과시킨다.
  // (api/ 제외: 실시간 스트림이 claim 쿠키로 claim 페이지로 리다이렉트되면 안 됨.)
  matcher: ["/((?!_next/|api/|favicon|icons/).*)"],
};
