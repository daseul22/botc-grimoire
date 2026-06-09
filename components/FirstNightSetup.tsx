"use client";

import { TEAM_MAP } from "@/lib/constants";
import type { Character, Game } from "@/lib/types";

/** 1일차 밤 전용: 셋업 영향 직업 안내 + 악마 블러핑(3) 기록 */
export function FirstNightSetup({
  game,
  sheetChars,
  busy,
  onSetBluffs,
}: {
  game: Game;
  sheetChars: Character[];
  busy: boolean;
  onSetBluffs: (ids: string[]) => void;
}) {
  const charMap = Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>;
  const inPlay = new Set(game.players.map((p) => p.characterId));

  // 셋업에 영향을 주는 인플레이 직업(중복 제거)
  const setupRoles: Character[] = [];
  const seen = new Set<string>();
  for (const p of game.players) {
    const c = charMap[p.characterId];
    if (c?.setup && !seen.has(c.id)) {
      seen.add(c.id);
      setupRoles.push(c);
    }
  }

  // 블러핑 후보: 인플레이 제외 마을주민/외지인
  const bluffCandidates = sheetChars
    .filter((c) => (c.team === "townsfolk" || c.team === "outsider") && !inPlay.has(c.id))
    .sort((a, b) => a.name.ko.localeCompare(b.name.ko, "ko"));

  const toggleBluff = (id: string) => {
    const cur = game.bluffs;
    const next = cur.includes(id)
      ? cur.filter((x) => x !== id)
      : cur.length >= 3
        ? cur
        : [...cur, id];
    if (next !== cur) onSetBluffs(next);
  };

  return (
    <div className="mb-3 space-y-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
      <p className="text-xs font-semibold text-gold">🌙 1일차 밤 셋업</p>

      {/* 셋업 영향 직업 */}
      {setupRoles.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted">
            셋업 변경 직업이 있습니다 — 아래 모디파이어대로 인플레이 직업을 수동으로 추가/제거하세요.
            위 <strong>팀 분포 카운트(마을/외부/하수/데몬)</strong>가 보정 후 시트와 일치하는지 확인하세요.
          </p>
          <div className="flex flex-wrap gap-2">
            {setupRoles.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs">
                {c.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" className="h-5 w-5 rounded-full object-cover" />
                )}
                <span className="font-medium" style={{ color: TEAM_MAP[c.team]?.color }}>{c.name.ko}</span>
                {c.setupNote?.ko && <span className="text-muted">· {c.setupNote.ko}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 악마 블러핑 */}
      <div>
        <p className="mb-1.5 text-xs text-muted">
          악마 블러핑 <span className="opacity-70">(인플레이에 없는 마을주민·외지인 중 3개 선택)</span>
          <span className="ml-1 font-semibold text-gold">{game.bluffs.length}/3</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {bluffCandidates.map((c) => {
            const on = game.bluffs.includes(c.id);
            const full = game.bluffs.length >= 3 && !on;
            return (
              <button
                key={c.id}
                type="button"
                disabled={busy || full}
                onClick={() => toggleBluff(c.id)}
                title={c.name.ko}
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                  on
                    ? "border-gold bg-gold/15 text-gold"
                    : full
                      ? "border-border opacity-30"
                      : "border-border hover:bg-surface-2"
                }`}
                style={{ color: on ? undefined : TEAM_MAP[c.team]?.color }}
              >
                {c.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" className="h-4 w-4 rounded-full object-cover" />
                )}
                {c.name.ko}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
