"use client";

import { useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import { MARKER_MAP } from "@/lib/markers";
import { formatResult, markerForAction, RESULT_KIND_LABEL, type ActionSpec } from "@/lib/night-actions";
import type { Character, GamePlayer, NightActionRecord } from "@/lib/types";

const short = (s: string) => (s.length > 7 ? s.slice(0, 6) + "…" : s);

export function NightActionRow({
  actor,
  spec,
  players,
  charMap,
  record,
  busy,
  onRecord,
  onClear,
  onApplyMarker,
}: {
  actor: GamePlayer;
  spec: ActionSpec;
  players: GamePlayer[];
  charMap: Record<string, Character>;
  record?: NightActionRecord;
  busy: boolean;
  onRecord: (targets: number[], result: string) => void;
  onClear: () => void;
  onApplyMarker: (seats: number[], markerStr: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState<number[]>(record?.targets ?? []);
  const [result, setResult] = useState<string>(record?.result ?? "");

  const marker = spec.marker ? MARKER_MAP[spec.marker] : undefined;
  const markerSeats = spec.targets === 0 ? [actor.seat] : targets;
  const canApplyMarker = !!marker && markerSeats.length > 0 && (spec.marker !== "mad" || !!result);

  // 지목도 결과도 마커도 없으면 기록할 것이 없음(순수 정보 없는 패시브/위장 등)
  const nothingToRecord = spec.targets === 0 && spec.result === "none" && !marker;
  if (nothingToRecord && !record) return null;

  // 편집 시작: 기존 기록 값으로 초기화
  const startEdit = () => {
    setTargets(record?.targets ?? []);
    setResult(record?.result ?? "");
    setEditing(true);
  };

  const toggleTarget = (seat: number) => {
    setTargets((cur) =>
      cur.includes(seat)
        ? cur.filter((s) => s !== seat)
        : cur.length >= spec.targets
          ? cur
          : [...cur, seat],
    );
  };

  const save = () => {
    onRecord(targets, result);
    setEditing(false);
  };

  const pickable = players.filter((p) => p.seat !== actor.seat);
  const nameOf = (seat: number) => players.find((p) => p.seat === seat)?.nickname ?? `${seat}`;

  // ── 기록 요약 (편집 중 아님) ──
  if (record && !editing) {
    const resText = formatResult(spec.result, record.result, charMap);
    return (
      <div className="mt-1.5 ml-6 rounded-md border border-gold/30 bg-gold/5 px-2 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          {record.targets.length > 0 ? (
            <>
              <span className="text-muted">지목</span>
              {record.targets.map((s) => (
                <span key={s} className="rounded bg-surface-2 px-1.5 py-0.5 font-medium" title={nameOf(s)}>
                  {short(nameOf(s))}
                </span>
              ))}
            </>
          ) : (
            <span className="text-muted">지목 없음</span>
          )}
          {resText && (
            <span className="ml-1 font-semibold text-gold">＝ {resText}</span>
          )}
        </div>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={startEdit} className="text-muted hover:text-text">수정</button>
          <button type="button" disabled={busy} onClick={onClear} className="text-muted hover:text-red-400 disabled:opacity-50">지우기</button>
          {canApplyMarker && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onApplyMarker(markerSeats, markerForAction(spec.marker!, record.result))}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 disabled:opacity-50"
              style={{ background: `${marker!.color}22`, color: marker!.color }}
              title={`${marker!.label} 마커 적용`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marker!.icon} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
              {marker!.label} 적용
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── 행동 없음 + 미편집: 기록 버튼 ──
  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="mt-1.5 ml-6 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted hover:border-gold/50 hover:text-gold"
      >
        ＋ 행동 기록
      </button>
    );
  }

  // ── 편집기 ──
  return (
    <div className="mt-1.5 ml-6 space-y-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
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

      {canApplyMarker && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onApplyMarker(markerSeats, markerForAction(spec.marker!, result))}
          className="inline-flex items-center gap-1 rounded px-2 py-1 disabled:opacity-50"
          style={{ background: `${marker!.color}22`, color: marker!.color }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={marker!.icon} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
          {marker!.label} 대상 적용
        </button>
      )}

      <div className="flex gap-2 pt-0.5">
        <button type="button" disabled={busy} onClick={save} className="rounded bg-gold px-3 py-1 font-semibold text-bg disabled:opacity-50">저장</button>
        <button type="button" onClick={() => setEditing(false)} className="rounded border border-border px-2 py-1 text-muted hover:text-text">취소</button>
      </div>
    </div>
  );
}
