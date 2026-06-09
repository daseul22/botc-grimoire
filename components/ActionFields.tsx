"use client";

import { TEAM_MAP } from "@/lib/constants";
import { RESULT_KIND_LABEL, type ActionSpec } from "@/lib/night-actions";
import type { Character, GamePlayer } from "@/lib/types";

const short = (s: string) => (s.length > 7 ? s.slice(0, 6) + "…" : s);

/** 지목(타겟) 칩 + 결과 위젯. NightActionRow / 주장 기록 공용 입력부. */
export function ActionFields({
  spec,
  players,
  charMap,
  actorSeat,
  targets,
  setTargets,
  result,
  setResult,
}: {
  spec: ActionSpec;
  players: GamePlayer[];
  charMap: Record<string, Character>;
  actorSeat: number;
  targets: number[];
  setTargets: (fn: (cur: number[]) => number[]) => void;
  result: string;
  setResult: (v: string) => void;
}) {
  const pickable = players.filter((p) => p.seat !== actorSeat);
  const toggleTarget = (seat: number) =>
    setTargets((cur) =>
      cur.includes(seat)
        ? cur.filter((s) => s !== seat)
        : cur.length >= spec.targets
          ? cur
          : [...cur, seat],
    );

  return (
    <>
      {spec.targets > 0 && (
        <div>
          <p className="mb-1 text-muted">지목 <span className="opacity-60">(최대 {spec.targets})</span></p>
          <div className="flex flex-wrap gap-1">
            {pickable.map((p) => {
              const on = targets.includes(p.seat);
              const full = targets.length >= spec.targets && !on;
              return (
                <button
                  key={p.seat}
                  type="button"
                  disabled={full}
                  onClick={() => toggleTarget(p.seat)}
                  title={p.nickname}
                  className={`rounded px-1.5 py-0.5 ${
                    on
                      ? "bg-gold/20 text-gold ring-1 ring-gold/50"
                      : full
                        ? "opacity-30"
                        : "bg-surface hover:bg-surface-2"
                  } ${p.status === "dead" ? "line-through" : ""}`}
                >
                  {short(p.nickname)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {spec.result !== "none" && (
        <div>
          <p className="mb-1 text-muted">
            결과 <span className="opacity-60">· {RESULT_KIND_LABEL[spec.result]}</span>
            {spec.hint && <span className="ml-1 opacity-60">({spec.hint})</span>}
          </p>
          {spec.result === "number" && (
            <input
              type="number"
              min={0}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              className="w-20 rounded border border-border bg-surface px-2 py-1 outline-none focus:border-gold/60"
            />
          )}
          {spec.result === "yesno" && (
            <div className="flex gap-1">
              {[["yes", "예"], ["no", "아니오"]].map(([v, label]) => (
                <button key={v} type="button" onClick={() => setResult(v)} className={`rounded px-2.5 py-1 ${result === v ? "bg-gold/20 text-gold ring-1 ring-gold/50" : "bg-surface hover:bg-surface-2"}`}>{label}</button>
              ))}
            </div>
          )}
          {spec.result === "team" && (
            <div className="flex gap-1">
              {[["good", "선", "#4a90d9"], ["evil", "악", "#d23b3b"]].map(([v, label, c]) => (
                <button key={v} type="button" onClick={() => setResult(v)} className="rounded px-2.5 py-1 ring-1" style={result === v ? { background: `${c}22`, color: c, borderColor: c } : { borderColor: "transparent" }}>{label}</button>
              ))}
            </div>
          )}
          {spec.result === "role" && (
            <select value={result} onChange={(e) => setResult(e.target.value)} className="max-w-full rounded border border-border bg-surface px-2 py-1 outline-none focus:border-gold/60">
              <option value="">선택 안 함</option>
              {Object.values(charMap)
                .sort((a, b) => a.name.ko.localeCompare(b.name.ko, "ko"))
                .map((c) => (
                  <option key={c.id} value={c.id} style={{ color: TEAM_MAP[c.team]?.color }}>{c.name.ko}</option>
                ))}
            </select>
          )}
          {spec.result === "text" && (
            <input
              type="text"
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder={spec.hint ?? "결과 메모"}
              className="w-full rounded border border-border bg-surface px-2 py-1 outline-none focus:border-gold/60"
            />
          )}
        </div>
      )}
    </>
  );
}
