// 이관 전 원본 스펙 로더 — extract/verify 공용.
//
// 이관 전 lib/night-actions.ts(하드코딩 Record 상수)를 git에서 꺼내 임시 모듈로 되살린 뒤
// 상수를 읽어 온다. 손으로 옮긴 값과 비교할 "정답지"를 언제든 재현하기 위한 장치다.
//
// 임시 파일을 lib/ 아래에 쓰는 이유: 원본이 `./types`를 상대경로로 import하므로
// 같은 디렉터리에 있어야 해석된다. 읽고 나면 반드시 지운다(finally).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
/**
 * 이관 직전 리비전(= 하드코딩 스펙이 살아 있는 마지막 커밋)을 고정한다.
 * HEAD로 두면 이관을 커밋한 순간 원본이 사라져 검증이 자기 자신과 비교하게 되므로,
 * "정답지"를 잃지 않도록 해시를 박아 둔다. BOTC_BEHAVIOR_REV로 덮어쓸 수 있다.
 */
const REV = process.env.BOTC_BEHAVIOR_REV ?? "67262bf";

export type OriginalSpecs = {
  ACTION_SPECS: Record<string, unknown>;
  DAY_ACTION_SPECS: Record<string, unknown>;
  OTHER_NIGHT_SPECS: Record<string, unknown>;
  ACTION_CRITERIA: Record<string, string>;
  MISREGISTER_ROLES: Record<string, "good-as-evil" | "evil-as-good">;
  ST_CHOOSES_TARGETS: ReadonlySet<string>;
};

/** 이관 전 night-actions.ts의 상수들을 읽어 온다. 원본이 없으면 명확히 실패시킨다. */
export async function loadOriginalSpecs(): Promise<OriginalSpecs> {
  const src = execFileSync("git", ["show", `${REV}:lib/night-actions.ts`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!src.includes("ACTION_SPECS")) {
    throw new Error(
      `${REV}:lib/night-actions.ts에 ACTION_SPECS가 없습니다. ` +
        `이관 후 커밋이라면 BOTC_BEHAVIOR_REV로 이관 직전 리비전을 지정하세요.`,
    );
  }
  const tmp = path.join(ROOT, "lib", `__behavior-origin-${process.pid}.ts`);
  fs.writeFileSync(tmp, src);
  try {
    return (await import(tmp)) as unknown as OriginalSpecs;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
