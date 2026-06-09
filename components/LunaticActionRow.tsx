"use client";

import { useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import type { Character, Game } from "@/lib/types";
import { RolePickerModal } from "./RolePickerModal";

/**
 * 미치광이 전용 행동 row. 일반 NightActionRow와 다른 점:
 * - 지목 절차 X. ST가 가짜 블러핑(3 직업)·가짜 하수인(좌석 N명)을 자유 지정.
 * - 두 보여주기 버튼(블러핑/하수인) — show 페이지 ?mode=lunatic-bluffs|lunatic-minions로.
 *
 * 저장은 게임 전역(game.lunaticBluffs / lunaticMinions). 진짜 데몬 정보(game.bluffs)와 별개.
 */
export function LunaticActionRow({
  gameId,
  game,
  actorSeat,
  sheetChars,
  charMap,
  busy,
  onSetBluffs,
  onSetMinions,
}: {
  gameId: string;
  game: Game;
  actorSeat: number;
  sheetChars: Character[];
  charMap: Record<string, Character>;
  busy: boolean;
  onSetBluffs: (ids: string[]) => void;
  onSetMinions: (seats: number[]) => void;
}) {
  // 직업 picker가 어느 슬롯을 편집 중인지 (0/1/2)
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const bluffs = game.lunaticBluffs;
  const minions = game.lunaticMinions;

  const setBluffAt = (slot: number, id: string) => {
    const next = [...bluffs];
    while (next.length < 3) next.push("");
    next[slot] = id;
    onSetBluffs(next.slice(0, 3));
  };

  const toggleMinion = (seat: number) => {
    onSetMinions(minions.includes(seat) ? minions.filter((s) => s !== seat) : [...minions, seat]);
  };

  const pickerCurrent = pickerSlot != null ? bluffs[pickerSlot] ?? "" : "";

  return (
    <div className="mt-1.5 ml-6 space-y-2 rounded-md border border-gold/30 bg-gold/5 p-2 text-xs">
      <div>
        <p className="mb-1 text-muted">가짜 블러핑 직업 <span className="opacity-60">(3개 자유 선택)</span></p>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => {
            const id = bluffs[i];
            const ch = id ? charMap[id] : undefined;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPickerSlot(i)}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 hover:border-gold/60"
              >
                {ch ? (
                  <>
                    {ch.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ch.image} alt="" className="h-5 w-5 rounded-full object-cover" />
                    )}
                    <span style={{ color: TEAM_MAP[ch.team]?.color }}>{ch.name.ko}</span>
                  </>
                ) : (
                  <span className="text-muted">＋ 직업 {i + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-muted">가짜 하수인 좌석 <span className="opacity-60">(자유 선택)</span></p>
        <div className="flex flex-wrap gap-1">
          {game.players
            .filter((p) => p.seat !== actorSeat)
            .map((p) => {
              const on = minions.includes(p.seat);
              return (
                <button
                  key={p.seat}
                  type="button"
                  onClick={() => toggleMinion(p.seat)}
                  className={`rounded px-1.5 py-0.5 ${on ? "bg-gold/20 text-gold ring-1 ring-gold/50" : "bg-surface hover:bg-surface-2"}`}
                >
                  {p.nickname}
                </button>
              );
            })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-0.5">
        <a
          href={`/play/${gameId}/show/${actorSeat}?mode=lunatic-bluffs`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded bg-gold/15 px-2 py-1 text-gold hover:bg-gold/25"
        >
          🎴 보여주기 · 블러핑
        </a>
        <a
          href={`/play/${gameId}/show/${actorSeat}?mode=lunatic-minions`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded bg-gold/15 px-2 py-1 text-gold hover:bg-gold/25"
        >
          🎴 보여주기 · 하수인
        </a>
      </div>

      <RolePickerModal
        open={pickerSlot != null}
        title={`가짜 블러핑 직업 ${(pickerSlot ?? 0) + 1}`}
        candidates={sheetChars}
        selected={pickerCurrent}
        clearLabel="비우기"
        onPick={(id) => {
          if (pickerSlot == null) return;
          if (!id) {
            const next = [...bluffs];
            next[pickerSlot] = "";
            onSetBluffs(next);
          } else {
            setBluffAt(pickerSlot, id);
          }
        }}
        onClose={() => setPickerSlot(null)}
      />

    </div>
  );
}
