"use client";

import { useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import { seatsShownAsMinions } from "@/lib/roles";
import type { Character, Game } from "@/lib/types";
import { RolePickerModal } from "./RolePickerModal";

/**
 * 미치광이 전용 행동 row. 일반 NightActionRow와 다른 점:
 * - 지목 절차 X. ST가 가짜 블러핑(3 직업)·가짜 하수인(좌석 N명)을 자유 지정.
 * - 두 보여주기 버튼(블러핑/하수인) — show 페이지 ?mode=lunatic-bluffs|lunatic-minions로.
 *
 * 저장은 게임 전역(game.lunaticBluffs / lunaticMinions). 진짜 데몬 정보(game.bluffs)와 별개.
 * readOnly: 그 외 밤 — 첫밤에 알려준 블러핑·하수인을 수정 없이 확인만(보여주기는 가능).
 */
export function LunaticActionRow({
  gameId,
  game,
  actorSeat,
  sheetChars,
  charMap,
  busy,
  readOnly,
  onSetBluffs,
  onSetMinions,
}: {
  gameId: string;
  game: Game;
  actorSeat: number;
  sheetChars: Character[];
  charMap: Record<string, Character>;
  busy: boolean;
  readOnly?: boolean;
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

  // 실제 악마가 받는 화면(블러핑 3 + 하수인 좌석)을 그대로 복사. show ?mode=minions와
  // 동일 규칙(lib/roles.seatsShownAsMinions)을 써 미치광이가 진짜 악마와 같은 화면을 보게 한다.
  const demonMinionSeats = seatsShownAsMinions(
    game.players,
    (id) => charMap[id]?.team,
    { excludeSeat: actorSeat },
  );
  const canPreset = game.bluffs.length > 0 || demonMinionSeats.length > 0;
  const applyDemonPreset = () => {
    onSetBluffs(game.bluffs.slice(0, 3));
    onSetMinions(demonMinionSeats);
  };

  const pickerCurrent = pickerSlot != null ? bluffs[pickerSlot] ?? "" : "";

  return (
    <div className="mt-1.5 ml-6 space-y-2 rounded-md border border-gold/30 bg-gold/5 p-2 text-xs">
      {/* 실제 악마와 동일하게 채우기 — 첫밤 편집 시에만. 완전 자유 선택은 이후에도 가능. */}
      {!readOnly && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-1.5">
          <button
            type="button"
            disabled={busy || !canPreset}
            onClick={applyDemonPreset}
            title="진짜 악마가 받는 블러핑·하수인 화면을 그대로 복사 (마술사 포함). 이후 자유 수정 가능."
            className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-40"
          >
            실제 악마와 동일하게 채우기
          </button>
          <p className="mt-1 text-[11px] text-muted">
            진짜 악마의 블러핑 3개 + 하수인(마술사 포함)을 그대로 복사합니다 — 이후 슬롯·좌석을 자유롭게 수정할 수 있습니다.
            {!canPreset && " (먼저 위 셋업에서 악마 블러핑·하수인을 지정하세요.)"}
          </p>
        </div>
      )}
      <div>
        <p className="mb-1 text-muted">
          가짜 블러핑 직업 <span className="opacity-60">{readOnly ? "(첫밤에 알려줌)" : "(3개 자유 선택)"}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {readOnly && !bluffs.some(Boolean) && <span className="text-muted">미지정</span>}
          {[0, 1, 2].map((i) => {
            const id = bluffs[i];
            const ch = id ? charMap[id] : undefined;
            if (readOnly && !ch) return null;
            const inner = ch ? (
              <>
                {ch.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ch.image} alt="" className="h-5 w-5 rounded-full object-cover" />
                )}
                <span style={{ color: TEAM_MAP[ch.team]?.color }}>{ch.name.ko}</span>
              </>
            ) : (
              <span className="text-muted">＋ 직업 {i + 1}</span>
            );
            if (readOnly) {
              return (
                <span key={i} className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1">
                  {inner}
                </span>
              );
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPickerSlot(i)}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 hover:border-gold/60"
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-muted">
          가짜 하수인 좌석 <span className="opacity-60">{readOnly ? "(첫밤에 알려줌)" : "(자유 선택)"}</span>
        </p>
        <div className="flex flex-wrap gap-1">
          {readOnly && minions.length === 0 && <span className="text-muted">미지정</span>}
          {game.players
            .filter((p) => p.seat !== actorSeat && (!readOnly || minions.includes(p.seat)))
            .map((p) => {
              const on = minions.includes(p.seat);
              if (readOnly) {
                return (
                  <span key={p.seat} className="rounded bg-gold/20 px-1.5 py-0.5 text-gold ring-1 ring-gold/50">
                    {p.nickname}
                  </span>
                );
              }
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
          보여주기 · 블러핑
        </a>
        <a
          href={`/play/${gameId}/show/${actorSeat}?mode=lunatic-minions`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded bg-gold/15 px-2 py-1 text-gold hover:bg-gold/25"
        >
          보여주기 · 하수인
        </a>
      </div>

      <RolePickerModal
        open={!readOnly && pickerSlot != null}
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
