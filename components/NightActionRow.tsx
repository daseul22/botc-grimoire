"use client";

import { useState } from "react";
import { MARKER_MAP } from "@/lib/markers";
import { formatResult, markerForAction, type ActionSpec } from "@/lib/night-actions";
import type { Character, GamePlayer, NightActionRecord } from "@/lib/types";
import { ActionFields } from "./ActionFields";

const short = (s: string) => (s.length > 7 ? s.slice(0, 6) + "…" : s);

export function NightActionRow({
  actor,
  spec,
  characterId,
  players,
  charMap,
  record,
  busy,
  gameId,
  onRecord,
  onClear,
  onApplyMarker,
}: {
  actor: GamePlayer;
  spec: ActionSpec;
  /** 이 행이 다루는 직업 id(가짜/실제). showcase URL에 핀해 같은 좌석의 다른 노드와 구분. */
  characterId: string;
  players: GamePlayer[];
  charMap: Record<string, Character>;
  record?: NightActionRecord;
  busy: boolean;
  gameId: string;
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

  // showcase 배열이면 변형 라벨(악마용/하수인용) — 보여주기 버튼 N개로 분기
  const showcaseArr = Array.isArray(spec.showcase) ? spec.showcase : spec.showcase ? [spec.showcase] : [];
  const showcaseLabels = spec.showcaseLabels ?? [];
  const hasShowcase = showcaseArr.length > 0;

  // 지목도 결과도 마커도 *없고* showcase조차 없는 패시브 직업은 행 자체를 숨긴다.
  const nothingToRecord = spec.targets === 0 && spec.result === "none" && !marker;
  if (nothingToRecord && !record && !hasShowcase) return null;

  // showcase URL 빌더 — as=직업 핀(같은 좌석 다른 노드 구분), mode 있으면 ?mode=, 배열이면 ?v=.
  const showcaseHref = (i: number) => {
    const s = showcaseArr[i];
    const qs: string[] = [`as=${characterId}`];
    if (s?.mode) qs.push(`mode=${s.mode}`);
    if (showcaseArr.length > 1) qs.push(`v=${i}`);
    return `/play/${gameId}/show/${actor.seat}?${qs.join("&")}`;
  };

  // 기록할 게 없지만 showcase는 있는 케이스(마술사/꼭두각시): record 없이도 보여주기만 노출.
  const showcaseOnly = nothingToRecord && hasShowcase;
  if (showcaseOnly) {
    return (
      <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-2 text-xs">
        {showcaseArr.map((_, i) => (
          <a
            key={i}
            href={showcaseHref(i)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded bg-gold/15 px-2 py-1 text-gold hover:bg-gold/25"
          >
            🎴 보여주기{showcaseArr.length > 1 ? ` · ${showcaseLabels[i] ?? `#${i + 1}`}` : ""}
          </a>
        ))}
      </div>
    );
  }

  const startEdit = () => {
    setTargets(record?.targets ?? []);
    setResult(record?.result ?? "");
    setEditing(true);
  };

  const save = () => {
    onRecord(targets, result);
    setEditing(false);
  };

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
          {resText && <span className="ml-1 font-semibold text-gold">＝ {resText}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={startEdit} className="text-muted hover:text-text">수정</button>
          <button type="button" disabled={busy} onClick={onClear} className="text-muted hover:text-red-400 disabled:opacity-50">지우기</button>
          {spec.playerPicks && (
            <a
              href={`/play/${gameId}/pick/${actor.seat}`}
              target="_blank"
              rel="noopener noreferrer"
              title="플레이어에게 직업 목록을 보여주고 직접 고르게 하기"
              className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-muted hover:text-text"
            >
              📋 직업 목록
            </a>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* result 없는 직업도 명시적 showcase가 있으면 노출(미치광이 가짜 공격 → 데몬에게). */}
            {showcaseArr.length <= 1 && (spec.result !== "none" || hasShowcase) && (
              <a
                href={showcaseHref(0)}
                target="_blank"
                rel="noopener noreferrer"
                title="결과를 새 창에 풀스크린으로 — 플레이어에게 보여주기"
                className="inline-flex items-center gap-1 rounded bg-gold/15 px-1.5 py-0.5 text-gold hover:bg-gold/25"
              >
                🎴 보여주기
              </a>
            )}
            {showcaseArr.length > 1 &&
              showcaseArr.map((_, i) => (
                <a
                  key={i}
                  href={showcaseHref(i)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-gold/15 px-1.5 py-0.5 text-gold hover:bg-gold/25"
                >
                  🎴 {showcaseLabels[i] ?? `#${i + 1}`}
                </a>
              ))}
            {canApplyMarker && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onApplyMarker(markerSeats, markerForAction(spec.marker!, record.result))}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 disabled:opacity-50"
                style={{ background: `${marker!.color}22`, color: marker!.color }}
                title={`${marker!.label} 마커 적용`}
              >
                {marker!.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={marker!.icon} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                ) : (
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: marker!.color }}>{marker!.letter ?? "●"}</span>
                )}
                {marker!.label} 적용
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── 행동 없음 + 미편집: 기록 버튼 ──
  if (!editing) {
    return (
      <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={startEdit}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-muted hover:border-gold/50 hover:text-gold"
        >
          ＋ 행동 기록
        </button>
        {spec.playerPicks && (
          <a
            href={`/play/${gameId}/pick/${actor.seat}`}
            target="_blank"
            rel="noopener noreferrer"
            title="플레이어에게 직업 목록을 보여주고 직접 고르게 하기"
            className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-1 text-muted hover:text-text"
          >
            📋 직업 목록
          </a>
        )}
      </div>
    );
  }

  // ── 편집기 ──
  return (
    <div className="mt-1.5 ml-6 space-y-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
      <ActionFields
        spec={spec}
        players={players}
        charMap={charMap}
        actorSeat={actor.seat}
        targets={targets}
        setTargets={setTargets}
        result={result}
        setResult={setResult}
      />

      {canApplyMarker && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onApplyMarker(markerSeats, markerForAction(spec.marker!, result))}
          className="inline-flex items-center gap-1 rounded px-2 py-1 disabled:opacity-50"
          style={{ background: `${marker!.color}22`, color: marker!.color }}
        >
          {marker!.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marker!.icon} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
          ) : (
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: marker!.color }}>{marker!.letter ?? "●"}</span>
          )}
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
