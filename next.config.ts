import type { NextConfig } from "next";
import os from "node:os";

// 개발 서버를 LAN(폰)에서 열면 Next dev가 /_next/* 리소스를 cross-origin으로 차단한다.
// → 폰에서 HTML(SSR)은 떠도 JS 청크/RSC/서버액션이 막혀 하이드레이션이 안 되고 버튼이 죽는다.
// 현재 머신의 LAN IPv4를 모아 허용 목록에 넣는다(IP가 바뀌어도 dev 재시작 시 자동 반영).
const lanHosts: string[] = [];
for (const list of Object.values(os.networkInterfaces())) {
  for (const ni of list ?? []) {
    const isV4 = ni.family === "IPv4" || (ni.family as unknown) === 4;
    if (isV4 && !ni.internal) lanHosts.push(ni.address);
  }
}

// ngrok 등 외부 터널로 공유할 때의 origin. 무료 ngrok은 서브도메인이 매번 랜덤이라 와일드카드로.
// 고정 도메인을 쓰면 그 도메인만 넣어도 된다.
const tunnelHosts = ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"];

const nextConfig: NextConfig = {
  // better-sqlite3는 네이티브 모듈 → 번들하지 않고 서버 런타임에서 require
  serverExternalPackages: ["better-sqlite3"],
  // 사설 대역 와일드카드도 함께(글롭 미지원 시엔 위의 명시 IP가 커버). ngrok 터널 호스트도 허용.
  allowedDevOrigins: [...lanHosts, "192.168.*.*", "10.*.*.*", "172.*.*.*", ...tunnelHosts],
  // 서버액션 CSRF 검사(Origin↔Host 대조) — 터널 도메인에서 호출돼도 허용. dev·운영 공통 적용.
  experimental: { serverActions: { allowedOrigins: [...lanHosts, ...tunnelHosts] } },
  // dev에서 useTransition pending 표시 칩이 startTransition(async)+revalidatePath 조합에서
  // 가끔 해소되지 않아 화면에 stuck됨. 운영용 dev 모드라 인디케이터 비활성(에러 오버레이는 유지).
  devIndicators: false,
};

export default nextConfig;
