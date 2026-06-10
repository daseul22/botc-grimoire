"use client";

import { useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import { RESULT_KIND_LABEL, type ActionSpec } from "@/lib/night-actions";
import type { Character, GamePlayer } from "@/lib/types";
import { RolePickerModal } from "./RolePickerModal";

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
  // 본인 좌석도 지목 가능 — 임프 자결(스타패스), 핏해그·갬블러 자기 지정 등.
  const pickable = players;
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
            <RoleResultPicker
              charMap={charMap}
              value={result}
              onChange={setResult}
            />
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

/** 직업 결과 선택 — 토큰 모달. 드랍다운보다 시인성 ↑. */
function RoleResultPicker({
  charMap,
  value,
  onChange,
}: {
  charMap: Record<string, Character>;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = value ? charMap[value] : undefined;
  const candidates = Object.values(charMap);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1 hover:border-gold/60"
      >
        {picked ? (
          <>
            {picked.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picked.image} alt="" className="h-5 w-5 rounded-full object-cover" />
            )}
            <span style={{ color: TEAM_MAP[picked.team]?.color }}>{picked.name.ko}</span>
          </>
        ) : (
          <span className="text-muted">＋ 직업 선택</span>
        )}
      </button>
      <RolePickerModal
        open={open}
        title="결과 직업 선택"
        candidates={candidates}
        selected={value}
        onPick={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
