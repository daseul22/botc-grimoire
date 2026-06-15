"use client";

import { useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import type { Character, Game } from "@/lib/types";
import { RolePickerModal } from "./RolePickerModal";

/**
 * 첫밤 셋업 박스 — 셋업 영향 직업 안내, 악마 블러핑(3), 미치광이/주정뱅이/꼭두각시 가짜 직업.
 * readonly=true면 게임 진행 중에도 같은 정보를 *읽기 전용*으로 보여주기 위해 모든 인터랙션을 막는다.
 */
export function FirstNightSetup({
  game,
  sheetChars,
  busy,
  onSetBluffs,
  onSetDisguise,
  readonly = false,
}: {
  game: Game;
  sheetChars: Character[];
  busy: boolean;
  onSetBluffs: (ids: string[]) => void;
  onSetDisguise: (seat: number, characterId: string) => void;
  readonly?: boolean;
}) {
  const [pickerSeat, setPickerSeat] = useState<number | null>(null);
  const charMap = Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>;
  const inPlay = new Set(game.players.map((p) => p.characterId));
  // 위장(가짜직업)으로 쓰인 직업 = 누군가 자기 직업이라 믿는 직업 → 악마 블러핑 후보에서 제외.
  // (단 각 좌석의 가짜직업 picker에는 영향 주면 안 됨 — 자기 현재 위장이 사라지므로 bluff에만 한정.)
  const disguiseIds = new Set(Object.values(game.disguises ?? {}).filter(Boolean));

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

  // 블러핑 후보: 인플레이·위장 제외 마을주민/외지인
  const bluffCandidates = sheetChars
    .filter(
      (c) =>
        (c.team === "townsfolk" || c.team === "outsider") &&
        !inPlay.has(c.id) &&
        !disguiseIds.has(c.id),
    )
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

  // readonly면 인터랙티브 요소는 disabled 처리. 디자인 톤도 진해서 강조 약화.
  const interactiveDisabled = busy || readonly;

  return (
    <div className={`mb-3 space-y-3 rounded-lg border px-4 py-3 ${readonly ? "border-border bg-surface/60" : "border-gold/30 bg-gold/5"}`}>
      <p className={`text-xs font-semibold ${readonly ? "text-muted" : "text-gold"}`}>
        1일차 밤 셋업{readonly && <span className="ml-1 opacity-70">· 읽기 전용</span>}
      </p>

      {/* 셋업 영향 직업 */}
      {setupRoles.length > 0 && (
        <div>
          {!readonly && (
            <p className="mb-1 text-xs text-muted">
              셋업 변경 직업이 있습니다 — 아래 모디파이어대로 인플레이 직업을 수동으로 추가/제거하세요.
              위 <strong>팀 분포 카운트(마을/외부/하수/데몬)</strong>가 보정 후 시트와 일치하는지 확인하세요.
            </p>
          )}
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
                disabled={interactiveDisabled || full}
                onClick={readonly ? undefined : () => toggleBluff(c.id)}
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

      {/* 미치광이/주정뱅이 가짜 직업 — 본인이 폰에서 자기 진짜 직업 대신 볼 직업.
          하나라도 미선택이면 헤더의 직업배포·직업공유 버튼이 비활성된다. */}
      {(() => {
        // 가짜 직업 표시가 필요한 좌석: 미치광이(데몬 토큰) / 주정뱅이(마을주민 토큰) /
        // 꼭두각시(마을주민 토큰 — 본인은 town이라 믿는다).
        const disguiseSeats = game.players.filter(
          (p) =>
            p.characterId === "lunatic" ||
            p.characterId === "drunk" ||
            p.characterId === "marionette",
        );
        if (disguiseSeats.length === 0) return null;
        return (
          <div>
            <p className="mb-1.5 text-xs text-muted">
              가짜 직업 <span className="opacity-70">(미치광이=데몬 / 주정뱅이·꼭두각시=마을주민 중 선택)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {disguiseSeats.map((p) => {
                const cur = game.disguises?.[p.seat];
                const curCh = cur ? charMap[cur] : undefined;
                const ownCh = charMap[p.characterId];
                return (
                  <button
                    key={p.seat}
                    type="button"
                    disabled={interactiveDisabled}
                    onClick={readonly ? undefined : () => setPickerSeat(p.seat)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                      cur ? "border-border bg-surface" : readonly ? "border-border bg-surface opacity-70" : "border-amber-500/50 bg-amber-500/10"
                    }`}
                  >
                    <span className="font-medium">{p.nickname}</span>
                    <span className="text-muted opacity-70">({ownCh?.name.ko ?? p.characterId})</span>
                    <span className="opacity-50">→</span>
                    {curCh ? (
                      <>
                        {curCh.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={curCh.image} alt="" className="h-4 w-4 rounded-full object-cover" />
                        )}
                        <span style={{ color: TEAM_MAP[curCh.team]?.color }}>{curCh.name.ko}</span>
                      </>
                    ) : (
                      <span className="text-amber-400">선택 필요</span>
                    )}
                  </button>
                );
              })}
            </div>
            <RolePickerModal
              open={pickerSeat != null}
              title="가짜 직업 선택"
              candidates={(() => {
                if (pickerSeat == null) return [];
                const p = game.players.find((x) => x.seat === pickerSeat);
                if (!p) return [];
                if (p.characterId === "lunatic") {
                  return sheetChars.filter((c) => c.team === "demon");
                }
                // 주정뱅이·꼭두각시 둘 다 마을주민(인플레이 아님) 중에서 고른다.
                if (p.characterId === "drunk" || p.characterId === "marionette") {
                  return sheetChars.filter((c) => c.team === "townsfolk" && !inPlay.has(c.id));
                }
                return [];
              })()}
              selected={pickerSeat != null ? game.disguises?.[pickerSeat] ?? "" : ""}
              clearLabel="선택 해제"
              onPick={(id) => {
                if (pickerSeat == null) return;
                onSetDisguise(pickerSeat, id);
              }}
              onClose={() => setPickerSeat(null)}
            />
          </div>
        );
      })()}
    </div>
  );
}
