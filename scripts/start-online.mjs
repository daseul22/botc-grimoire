// 온라인 베타 실행 — Next 서버 + ngrok 고정 도메인 터널을 한 번에 띄운다.
// 서버(next start)는 필수(죽으면 전체 종료), ngrok은 보조(죽어도 서버는 유지).
// 외부 의존성 없이 child_process로만 오케스트레이션한다(concurrently 등 불필요).
//
// 환경변수로 덮어쓸 수 있다:
//   PORT         (기본 3000 — 앱 공유 링크가 :3000 하드코딩이라 바꾸려면 주의)
//   NGROK_DOMAIN (기본 botc.ngrok.app — config의 *.ngrok.app 와일드카드가 커버)
//   NO_TUNNEL=1  (ngrok 없이 서버만 — LAN 테스트용)

import { spawn } from "node:child_process";

const PORT = process.env.PORT || "3000";
const DOMAIN = process.env.NGROK_DOMAIN || "botc.ngrok.app";
const NO_TUNNEL = process.env.NO_TUNNEL === "1";

const procs = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { p } of procs) {
    if (p.exitCode === null && !p.killed) p.kill("SIGINT");
  }
  setTimeout(() => process.exit(code), 500);
}

function run(name, cmd, args, { critical }) {
  // shell 없이 실행(DEP0190 회피 + 인자 이스케이프 불필요). npm run이 node_modules/.bin을
  // PATH에 얹어줘 next가 해석되고, ngrok은 전역 설치라 PATH에서 찾는다.
  const p = spawn(cmd, args, { stdio: "inherit" });
  p.on("error", (err) => {
    console.error(`\n[${name}] 실행 실패: ${err.message}`);
    if (name === "ngrok") console.error("  → ngrok이 설치돼 있나요? (brew install ngrok / ngrok config add-authtoken <토큰>)");
    if (critical) shutdown(1);
  });
  p.on("exit", (exitCode) => {
    if (shuttingDown) return;
    if (critical) {
      console.log(`\n[${name}] 종료(code ${exitCode}) — 전체 정리합니다.`);
      shutdown(exitCode ?? 0);
    } else {
      console.warn(`\n[${name}] 종료(code ${exitCode}) — 서버는 계속 실행됩니다.`);
    }
  });
  procs.push({ name, p });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// 1) Next 서버 (필수)
run("server", "next", ["start", "-H", "0.0.0.0", "-p", PORT], { critical: true });

// 2) ngrok 터널 (보조)
if (NO_TUNNEL) {
  console.log("\n▶ NO_TUNNEL=1 — 터널 없이 서버만 실행합니다.");
} else {
  run("ngrok", "ngrok", ["http", `--url=https://${DOMAIN}`, PORT], { critical: false });
}

console.log(`\n▶ 서버:      http://0.0.0.0:${PORT}`);
if (!NO_TUNNEL) console.log(`▶ 공유 주소: https://${DOMAIN}`);
console.log("  (Ctrl+C 로 서버·터널을 함께 종료)\n");
