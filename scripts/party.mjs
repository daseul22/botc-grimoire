#!/usr/bin/env node
// 모임용 production 실행 — dev 모드의 온디맨드 컴파일 멈춤 없이 안정 구동.
// build가 이미 있으면 재사용(--rebuild 로 강제 재빌드), 없으면 빌드 후 start.
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";

const PORT = process.env.PORT ?? "3000";

function lanIp() {
  const addrs = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      const isV4 = ni.family === "IPv4" || ni.family === 4;
      if (isV4 && !ni.internal) addrs.push(ni.address);
    }
  }
  const rank = (ip) =>
    ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  return addrs.sort((a, b) => rank(a) - rank(b))[0];
}

const needBuild = process.argv.includes("--rebuild") || !existsSync(".next/BUILD_ID");
if (needBuild) {
  console.log("⏳ 빌드 중… (1~2분)");
  execSync("npm run build", { stdio: "inherit" });
} else {
  console.log("✓ 기존 빌드 재사용 (코드를 고쳤다면: npm run party -- --rebuild)");
}

const ip = lanIp();
console.log("");
console.log("🕰️  BotC 그리모어 — 모임 모드");
console.log(`   이야기꾼(이 컴퓨터):  http://localhost:${PORT}`);
if (ip) console.log(`   폰(같은 WiFi):       http://${ip}:${PORT}`);
else console.log("   ⚠ LAN IP를 찾지 못했습니다 — WiFi 연결을 확인하세요.");
console.log("");

spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", PORT], { stdio: "inherit" });
