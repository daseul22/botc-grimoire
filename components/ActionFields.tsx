"use client";

import { useEffect, useRef, useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import { formatResult, INFO_KINDS, infoTargetWarn, misregisterWarn, RESULT_KIND_LABEL, type ActionSpec } from "@/lib/night-actions";
import { suggestAction, type ActionSuggestion } from "@/lib/action-suggest";
import type { Character, GamePlayer, VoteRecord } from "@/lib/types";
import { RolePickerModal } from "./RolePickerModal";

const short = (s: string) => (s.length > 7 ? s.slice(0, 6) + "…" : s);

/** 지목(타겟) 칩 + 결과 위젯. NightActionRow / 주장 기록 공용 입력부. */
export function ActionFields({
  spec,
  players,
  charMap,
  actorSeat,
  actorCharacterId,
  targets,
  setTargets,
  result,
  setResult,
  suggest = false,
  globalMarkers = [],
  votes,
  lastExecution,
  isFirstNight,
}: {
  spec: ActionSpec;
  players: GamePlayer[];
  charMap: Record<string, Character>;
  actorSeat: number;
  /** 행동 주체의 직업 id — 점쟁이 한정 레드헤링 경고 판정 + 자동 추천 직업 판정에 사용. */
  actorCharacterId?: string;
  targets: number[];
  setTargets: (fn: (cur: number[]) => number[]) => void;
  result: string;
  setResult: (v: string) => void;
  /** 그리모어 상태 기반 결과 자동 추천을 켤지. 실제 행동에서만 true(주장/블러핑·미치광이 가짜 공격은 false). */
  suggest?: boolean;
  /** 전역 마커(Vortox 등) — 취함/중독 판정용. */
  globalMarkers?: string[];
  /** 현재 페이즈 투표 기록 — 일부 직업(추후) 추천용. */
  votes?: VoteRecord[];
  /** 직전 낮 처형 좌석+직업 — 장의사 자동 추천용. */
  lastExecution?: { seat: number; characterId: string } | null;
  isFirstNight?: boolean;
}) {
  // 본인 좌석도 지목 가능 — 임프 자결(스타패스), 핏해그·갬블러 자기 지정 등.
  const pickable = players;

  // ── 자동 추천 ── 그리모어 상태로 결과 기본값/이웃/근거를 계산(실제 행동에서만).
  const actor = players.find((p) => p.seat === actorSeat);
  const suggestion: ActionSuggestion | null =
    suggest && actor && actorCharacterId
      ? suggestAction({ characterId: actorCharacterId, actor, players, charMap, globalMarkers, votes, lastExecution, targets, isFirstNight })
      : null;
  // 타겟 비의존(공감자 등) 결과는 편집기 진입 시 1회 기본값 자동 채움.
  // 취함/중독/Vortox(tainted)면 채우지 않는다 — ST가 의식적으로 거짓값을 입력해야 하므로.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (suggestion && !suggestion.tainted && suggestion.result && spec.targets === 0 && result === "") {
      setResult(suggestion.result);
    }
    // 마운트 시 1회만 — 의도적으로 deps 비움.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fmtResult = (v: string) => formatResult(spec.result, v, charMap);
  // 정보 능력일 때만 은둔자/첩자(직업) + 레드헤링(점쟁이 한정) 등 '반대로 등록될 수 있는' 대상에 경고.
  const infoAction = INFO_KINDS.has(spec.result);
  const warnFor = (p: GamePlayer): string | undefined =>
    infoAction ? infoTargetWarn(p, actorCharacterId) : undefined;
  const trapWarn = (seat: number) => {
    const p = players.find((pp) => pp.seat === seat);
    return p ? warnFor(p) : undefined;
  };
  const toggleTarget = (seat: number) =>
    setTargets((cur) =>
      cur.includes(seat)
        ? cur.filter((s) => s !== seat)
        : cur.length >= spec.targets
          ? cur
          : [...cur, seat],
    );

  // 지목된 좌석의 *실제* 직업 — 결과 직업 선택 시 ST가 인지하도록 강조한다.
  // (취함/중독이면 일부러 다른 직업을 줄 수 있으니, 진짜를 보고 줄지/안 줄지 판단.)
  const targetHighlights = targets
    .map((seat) => {
      const p = players.find((pp) => pp.seat === seat);
      const ch = p ? charMap[p.characterId] : undefined;
      return ch && p ? { char: ch, note: p.nickname } : null;
    })
    .filter((x): x is { char: Character; note: string } => !!x);

  return (
    <>
      {/* 양 옆 이웃(공감자 등) — 누가 옆에 있고 선/악인지. 은둔자·첩자면 거짓 정보 주기 쉽게 경고. */}
      {suggestion?.neighbors && suggestion.neighbors.length > 0 && (
        <div className="rounded-md border border-border bg-surface/60 px-2 py-1.5">
          <p className="mb-1 text-muted">양 옆 이웃</p>
          <div className="flex flex-wrap gap-1">
            {suggestion.neighbors.map((nb) => {
              const color = nb.align === "evil" ? "#d23b3b" : "#4a90d9";
              return (
                <span
                  key={nb.player.seat}
                  title={nb.misregister ? `${nb.player.nickname} · ${misregisterWarn(nb.player.characterId)}` : nb.player.nickname}
                  className={`inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 ${nb.misregister ? "ring-1 ring-amber-400/60" : ""}`}
                >
                  {nb.misregister && <span className="text-amber-400">⚠</span>}
                  <span className="font-medium">{short(nb.player.nickname)}</span>
                  <span style={{ color }}>{nb.align === "evil" ? "악" : "선"}</span>
                </span>
              );
            })}
          </div>
          {suggestion.neighbors.some((nb) => nb.misregister) && (
            <div className="mt-1 space-y-0.5">
              {suggestion.neighbors
                .filter((nb) => nb.misregister)
                .map((nb) => (
                  <p key={nb.player.seat} className="rounded border-l-2 border-amber-400/50 bg-amber-500/5 px-2 py-0.5 text-[11px] text-amber-300/90">
                    ⚠ <span className="font-medium">{nb.player.nickname}</span> — {misregisterWarn(nb.player.characterId)}
                  </p>
                ))}
            </div>
          )}
        </div>
      )}

      {spec.targets > 0 && (
        <div>
          <p className="mb-1 text-muted">지목 <span className="opacity-60">(최대 {spec.targets})</span></p>
          <div className="flex flex-wrap gap-1">
            {pickable.map((p) => {
              const on = targets.includes(p.seat);
              const full = targets.length >= spec.targets && !on;
              const warn = warnFor(p);
              return (
                <button
                  key={p.seat}
                  type="button"
                  disabled={full}
                  onClick={() => toggleTarget(p.seat)}
                  title={warn ? `${p.nickname} · ${warn}` : p.nickname}
                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 ${
                    on
                      ? "bg-gold/20 text-gold ring-1 ring-gold/50"
                      : full
                        ? "opacity-30"
                        : "bg-surface hover:bg-surface-2"
                  } ${warn ? "ring-1 ring-amber-400/60" : ""} ${p.status === "dead" ? "line-through" : ""}`}
                >
                  {warn && <span className="text-amber-400">⚠</span>}
                  {short(p.nickname)}
                </button>
              );
            })}
          </div>
          {/* 선택된 대상 중 패시브 트랩(은둔자/첩자) 경고 — 폰에서 진짜 직업을 못 봐 실수 방지 */}
          {targets.map((s) => trapWarn(s)).filter(Boolean).length > 0 && (
            <div className="mt-1 space-y-0.5">
              {targets.map((s) => {
                const w = trapWarn(s);
                if (!w) return null;
                const nm = players.find((p) => p.seat === s)?.nickname ?? `${s}`;
                return (
                  <p key={s} className="rounded border-l-2 border-amber-400/50 bg-amber-500/5 px-2 py-0.5 text-[11px] text-amber-300/90">
                    ⚠ <span className="font-medium">{nm}</span> — {w}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}

      {spec.result !== "none" && (
        <div>
          <p className="mb-1 text-muted">
            결과 <span className="opacity-60">· {RESULT_KIND_LABEL[spec.result]}</span>
            {spec.hint && <span className="ml-1 opacity-60">({spec.hint})</span>}
          </p>
          {/* 자동 추천: 취함/중독이면 진짜값만(거짓 줘야 함), 아니면 원클릭 적용 칩. */}
          {suggestion?.result != null &&
            (suggestion.tainted ? (
              <p className="mb-1 rounded border-l-2 border-amber-400/50 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-300/90">
                ⚠ 진짜값 <span className="font-semibold">{fmtResult(suggestion.result)}</span>
                {suggestion.reason && <span className="opacity-80"> ({suggestion.reason})</span>} — 취함/중독 상태라{" "}
                <span className="font-semibold">거짓 정보</span>를 줘야 합니다
              </p>
            ) : (
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-muted">추천</span>
                <button
                  type="button"
                  onClick={() => setResult(suggestion.result!)}
                  className="inline-flex items-center gap-1 rounded bg-gold/15 px-1.5 py-0.5 font-semibold text-gold hover:bg-gold/25"
                >
                  {fmtResult(suggestion.result)} 적용
                </button>
                {suggestion.reason && <span className="text-muted">· {suggestion.reason}</span>}
                {suggestion.range && (
                  <span className="text-muted">· 가능 {suggestion.range.low}~{suggestion.range.high} ({suggestion.range.note})</span>
                )}
                {suggestion.note && <span className="text-amber-300/80">⚠ {suggestion.note}</span>}
              </div>
            ))}
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
              highlight={targetHighlights}
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
  highlight,
}: {
  charMap: Record<string, Character>;
  value: string;
  onChange: (v: string) => void;
  /** 지목된 좌석의 실제 직업(모달 상단 강조용) */
  highlight?: { char: Character; note: string }[];
}) {
  const [open, setOpen] = useState(false);
  const picked = value ? charMap[value] : undefined;
  // 전설(fabled)·설화(loric)는 스토리텔러 전용 메타 직업 — 정보 능력의 결과로 줄 수 없으니 제외.
  const candidates = Object.values(charMap).filter(
    (c) => c.team !== "fabled" && c.team !== "loric",
  );
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
        highlight={highlight}
      />
    </>
  );
}
