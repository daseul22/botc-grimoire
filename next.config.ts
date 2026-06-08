import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3는 네이티브 모듈 → 번들하지 않고 서버 런타임에서 require
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
