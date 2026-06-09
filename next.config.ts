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

const nextConfig: NextConfig = {
  // better-sqlite3는 네이티브 모듈 → 번들하지 않고 서버 런타임에서 require
  serverExternalPackages: ["better-sqlite3"],
  // 사설 대역 와일드카드도 함께(글롭 미지원 시엔 위의 명시 IP가 커버)
  allowedDevOrigins: [...lanHosts, "192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
