"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Character, Game } from "@/lib/types";
import { useGameStream } from "./useGameStream";
import { useAutoAdvance } from "./useAutoAdvance";
import { useDelayedFlag } from "./useDelayedFlag";
import { Select } from "./Select";
import { computeTally } from "@/lib/voting";
import type { NominationView } from "./DayVotePanel";
import {
  advanceNominationAction,
  cancelNominationAction,
  commitNominationAction,
  getActiveNominationAction,
  openNominationOnBehalfAction,
  pauseNominationAction,
  resumeNominationAction,
  setNominationHiddenAction,
  setNominationPaceAction,
  setNominationsOpenAction,
  startDayTimerAction,
  startVoteAction,
  stopDayTimerAction,
} from "@/app/rooms/actions";

const PACE_OPTS = [
  { value: 0, label: "수동(▶다음)" },
  { value: 3, label: "3초/명" },
  { value: 5, label: "5초/명" },
  { value: 8, label: "8초/명" },
  { value: 12, label: "12초/명" },
];

/**
 * 이야기꾼 낮 투표 콘솔(플로팅, 온라인 보드) — 대행 지목·시계바늘 스윕 진행·정산/처형.
 * 활성 지목은 게임 SSE로 즉시 refetch(액션 기반 — PlayCanvas 낙관 상태를 건드리지 않음).
 * 처형 정산 후에는 보드에 사망을 반영하려 router.refresh.
 */
export function DayConsole({
  game,
  sheetChars,
  roomId,
}: {
  game: Game;
  sheetChars: Character[];
  roomId: string;
}) {
  const [open, setOpen] = useState(false);
  const [nom, setNom] = useState<NominationView | null>(null);

  const load = () =>
    getActiveNominationAction(roomId)
      .then((n) => setNom(n as NominationView | null))
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  useGameStream(game.id, load);
  useAutoAdvance(nom, roomId, load); // ST가 자동 진행을 구동(패널 닫혀 있어도 동작)

  if (game.phase !== "day") return null; // 낮에만

  const needsAttention = nom && (nom.status === "tallied" || nom.status === "voting");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 z-40 flex h-12 items-center gap-1.5 rounded-full border border-gold/50 bg-surface px-4 shadow-lg hover:border-gold"
        title="낮 지목·투표"
      >
        <span className="text-sm font-semibold">낮 투표</span>
        {needsAttention && <span className="ml-0.5 h-2 w-2 rounded-full bg-red-400" aria-hidden />}
      </button>
    );
  }
  return (
    <DayPanel game={game} sheetChars={sheetChars} roomId={roomId} nom={nom} reload={load} onClose={() => setOpen(false)} />
  );
}

function DayPanel({
  game,
  sheetChars,
  roomId,
  nom,
  reload,
  onClose,
}: {
  game: Game;
  sheetChars: Character[];
  roomId: string;
  nom: NominationView | null;
  reload: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useDelayedFlag(pending); // 깜빡임 제거: 빠른 액션은 disabled 시각 전환 생략
  const inFlight = useRef(false); // 중복 제출 동기 차단
  const [err, setErr] = useState("");
  const charMap = useMemo(
    () => Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>,
    [sheetChars],
  );
  const nameOf = (seat: number) => game.players.find((p) => p.seat === seat)?.nickname ?? `좌석 ${seat + 1}`;
  const tally = computeTally(game.players, game.votes, charMap);

  const run = (fn: () => Promise<{ error: string } | unknown>, refresh = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      setErr("");
      try {
        const r = (await fn()) as { error?: string } | undefined;
        if (r && "error" in r && r.error) {
          setErr(r.error);
          return;
        }
        reload();
        if (refresh) router.refresh(); // 처형 사망을 보드(PlayCanvas)에 반영
      } finally {
        inFlight.current = false;
      }
    });
  };

  const upCount = nom ? nom.hands.filter((h) => h.hand === 1).length : 0;
  const curSeat = nom && nom.status === "voting" ? nom.order[nom.pointer] : undefined;
  const nomineeIsTraveller = nom
    ? charMap[game.players.find((p) => p.seat === nom.nominee)?.characterId ?? ""]?.team === "traveller"
    : false;
  const cutoff = nom
    ? nomineeIsTraveller
      ? tally.exileCutoff
      : tally.executionCutoff
    : tally.executionCutoff;

  return (
    <div className="fixed bottom-0 left-0 z-40 flex h-[78vh] w-full flex-col border border-border bg-surface shadow-xl sm:bottom-4 sm:left-4 sm:h-[34rem] sm:w-96 sm:rounded-2xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">낮 지목·투표 <span className="font-normal text-muted">· {game.day}일차</span></h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:text-text">✕</button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* 지목 받기 활성화 — 열어야 플레이어가 직접 지목(순차로 여러 번). 매 낮 자동 닫힘. */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg p-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">
              지목 받기 {game.nominationsOpen ? <span className="text-green-400">· 열림</span> : <span className="text-muted">· 닫힘</span>}
            </p>
            <p className="text-[11px] text-muted">열면 플레이어가 순차로 직접 지목할 수 있습니다.</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setNominationsOpenAction(roomId, !game.nominationsOpen), true)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
              game.nominationsOpen ? "border border-border text-muted hover:text-text" : "bg-gold text-bg"
            }`}
          >
            {game.nominationsOpen ? "지목 닫기" : "지목 받기 시작"}
          </button>
        </div>

        {/* 오늘 정산 맥락(committed) */}
        <div className="rounded-lg border border-border bg-surface-2/40 p-2 text-[11px]">
          <p className="flex items-center justify-between">
            <span className="text-muted">처형선 · 생존 {tally.aliveCount}명 과반</span>
            <span className="font-semibold tabular-nums text-gold">{tally.executionCutoff}표</span>
          </p>
          {game.votes.length > 0 && (
            <p className="mt-0.5 flex items-center justify-between">
              <span className="text-muted">오늘 최다</span>
              <span className="font-semibold tabular-nums">
                {tally.isTie
                  ? `동률 ${tally.topCount}명·${tally.highestVotes}표${tally.tieBlocks ? " (처형 없음)" : ""}`
                  : tally.leaderSeat != null
                    ? `${nameOf(tally.leaderSeat)}·${tally.highestVotes}표`
                    : "—"}
              </span>
            </p>
          )}
        </div>

        {err && <p className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">{err}</p>}

        {!nom ? (
          <NewNomination
            game={game}
            usedNominators={new Set(game.votes.map((v) => v.nominator))}
            usedNominees={new Set(game.votes.map((v) => v.nominee))}
            pending={busy}
            onCreate={(nominator, nominee) =>
              run(() => openNominationOnBehalfAction(roomId, nominator, nominee))
            }
          />
        ) : (
          <section className="space-y-2 rounded-lg border border-gold/40 bg-bg p-3">
            <div className="flex items-center justify-between text-sm">
              <span>
                <b>{nameOf(nom.nominator)}</b> <span className="text-muted">→</span> <b>{nameOf(nom.nominee)}</b>
              </span>
              <span className="text-[11px] text-muted">
                {nom.status === "pending" ? "시작 전" : nom.status === "voting" ? "투표 중" : "집계 완료"}
              </span>
            </div>

            {/* 주장·반론 타이머(ST 수동, 1분 기본) — 지목 후 지목자 주장 → 피지목자 반론. */}
            <NominationTimers game={game} roomId={roomId} run={run} busy={busy} />

            {/* 진행: 순서·손 */}
            {(nom.status === "voting" || nom.status === "tallied") && (
              <>
                <p className="flex items-center justify-between text-xs">
                  <span className="text-muted">
                    {nom.status === "voting" && curSeat != null
                      ? `현재 ${nameOf(curSeat)} (${Math.min(nom.pointer + 1, nom.order.length)}/${nom.order.length})`
                      : "스윕 완료"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    찬성 {upCount} / {cutoff}
                    {upCount >= cutoff ? <span className="ml-1 text-green-400">✓</span> : null}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {nom.order.map((seat, i) => {
                    const h = nom.hands.find((x) => x.seat === seat);
                    const done = i < nom.pointer || nom.status === "tallied";
                    const glyph = done ? (h?.hand === 1 ? "✋" : "·") : i === nom.pointer ? "▶" : "…";
                    return (
                      <span
                        key={seat}
                        className={`rounded border px-1.5 py-0.5 text-[11px] ${
                          i === nom.pointer && nom.status === "voting"
                            ? "border-gold bg-gold/15 text-text"
                            : h?.hand === 1
                              ? "border-green-500/40 bg-green-500/10 text-green-300"
                              : "border-border text-muted"
                        }`}
                        title={h?.isGhost ? "유령표" : undefined}
                      >
                        {glyph} {nameOf(seat)}
                        {h?.isGhost && h.hand === 1 ? " 🗳️" : ""}
                      </span>
                    );
                  })}
                </div>
              </>
            )}

            {/* 컨트롤 */}
            {nom.status === "pending" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => startVoteAction(roomId, nom.id))}
                  className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-40"
                >
                  ▶ 투표 시작
                </button>
                <Select
                  value={nom.perSeatSec}
                  onChange={(v) => run(() => setNominationPaceAction(roomId, nom.id, v ?? 0))}
                  ariaLabel="속도"
                  className="flex-1"
                  options={PACE_OPTS}
                />
              </div>
            )}
            {nom.status === "voting" && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => advanceNominationAction(roomId, nom.id, nom.step))}
                  className="rounded-lg bg-gold px-2.5 py-1.5 text-sm font-semibold text-bg disabled:opacity-40"
                >
                  ⏭ 다음
                </button>
                {nom.paused ? (
                  <button type="button" disabled={busy} onClick={() => run(() => resumeNominationAction(roomId, nom.id))} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:text-text">▶ 재개</button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => run(() => pauseNominationAction(roomId, nom.id))} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:text-text">⏸ 일시정지</button>
                )}
                <Select
                  value={nom.perSeatSec}
                  onChange={(v) => run(() => setNominationPaceAction(roomId, nom.id, v ?? 0))}
                  ariaLabel="속도"
                  className="min-w-28 flex-1"
                  options={PACE_OPTS}
                />
              </div>
            )}
            {(nom.status === "pending" || nom.status === "voting") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setNominationHiddenAction(roomId, nom.id, !nom.hidden))}
                title="오르간 그라인더 — 플레이어에게 손·집계를 숨기고 이야기꾼만 봅니다"
                className={`w-fit rounded-lg border px-2.5 py-1.5 text-xs ${nom.hidden ? "border-gold/60 bg-gold/15 text-gold" : "border-border text-muted hover:text-text"}`}
              >
                {nom.hidden ? "✓ 비공개 투표(오르간 그라인더)" : "비공개 투표(오르간 그라인더)"}
              </button>
            )}
            {nom.status === "tallied" && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted">
                  {nomineeIsTraveller
                    ? upCount >= cutoff
                      ? `추방선(${cutoff}표) 충족 — 추방할 수 있습니다(여행자, 처형과 별개).`
                      : `추방선 ${cutoff}표에 ${cutoff - upCount}표 부족.`
                    : upCount >= cutoff
                      ? `과반선(${cutoff}표) 충족 — 단독 최다일 때만 처형하세요.`
                      : `과반선 ${cutoff}표에 ${cutoff - upCount}표 부족.`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const verb = nomineeIsTraveller ? "추방" : "처형";
                      // 이미 계산된 tally를 재사용해 규칙 위반 소지(과반 미달·동률·비최다)를 confirm으로 경고(하드 차단 아님 — ST 판단 존중).
                      let warn = "";
                      if (upCount < cutoff) {
                        warn = `찬성 ${upCount}표는 ${nomineeIsTraveller ? "추방선" : "과반선"} ${cutoff}표에 미달입니다.\n`;
                      } else if (!nomineeIsTraveller && tally.highestVotes > 0 && upCount <= tally.highestVotes) {
                        warn =
                          upCount === tally.highestVotes
                            ? `오늘 최다 득표(${tally.highestVotes}표)와 동률입니다 — 룰상 동률은 처형되지 않습니다.\n`
                            : `오늘 최다 득표(${tally.highestVotes}표)보다 적어 단독 최다가 아닙니다.\n`;
                      }
                      if (confirm(`${warn}${nameOf(nom.nominee)}을(를) ${verb}할까요? (좌석이 사망 처리됩니다)`))
                        run(() => commitNominationAction(roomId, nom.id, true), true);
                    }}
                    className="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-500/30 disabled:opacity-40"
                  >
                    {nomineeIsTraveller ? "⊘ 추방 확정" : "☠️ 처형 확정"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => commitNominationAction(roomId, nom.id, false), true)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:text-text disabled:opacity-40"
                  >
                    {nomineeIsTraveller ? "정산만(추방 안 함)" : "정산만(처형 안 함)"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm("이 지목을 취소할까요?")) run(() => cancelNominationAction(roomId, nom.id));
              }}
              className="text-xs text-muted hover:text-red-400 disabled:opacity-40"
            >
              지목 취소
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

/** ST 대행 지목 — 지명자(생존)·대상 선택. 서버가 하루 한도·자격 재검증. */
function NewNomination({
  game,
  usedNominators,
  usedNominees,
  pending,
  onCreate,
}: {
  game: Game;
  usedNominators: Set<number>;
  usedNominees: Set<number>;
  pending: boolean;
  onCreate: (nominator: number, nominee: number) => void;
}) {
  const [nominator, setNominator] = useState<number | null>(null);
  const [nominee, setNominee] = useState<number | null>(null);
  const alive = game.players.filter((p) => p.status === "alive");
  return (
    <section className="space-y-2 rounded-lg border border-gold/40 bg-bg p-3">
      <h3 className="text-xs font-semibold">지목 (대행)</h3>
      <p className="text-[11px] text-muted">플레이어가 직접 지목할 수도 있습니다. 여기서는 이야기꾼이 대신 지목합니다.</p>
      <div>
        <p className="mb-1 text-xs text-muted">지목자 (생존)</p>
        <Select
          value={nominator}
          onChange={setNominator}
          placeholder="선택"
          ariaLabel="지목자"
          className="w-full"
          options={alive.map((p) => ({
            value: p.seat,
            label: p.nickname,
            sublabel: usedNominators.has(p.seat) ? "이미 지목함" : undefined,
            disabled: usedNominators.has(p.seat),
          }))}
        />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">대상</p>
        <Select
          value={nominee}
          onChange={setNominee}
          placeholder="선택"
          ariaLabel="지목 대상"
          className="w-full"
          options={game.players
            // 자기 자신 지목도 공식 규칙상 허용 — 지명자를 대상 목록에서 빼지 않는다.
            .map((p) => ({
              value: p.seat,
              label: p.nickname + (p.seat === nominator ? " (자기 지목)" : ""),
              sublabel: usedNominees.has(p.seat) ? "이미 지목받음" : p.status === "dead" ? "사망" : undefined,
              disabled: usedNominees.has(p.seat),
            }))}
        />
      </div>
      <button
        type="button"
        disabled={pending || nominator == null || nominee == null}
        onClick={() => nominator != null && nominee != null && onCreate(nominator, nominee)}
        className="w-full rounded-lg bg-gold py-2 text-sm font-semibold text-bg disabled:opacity-40"
      >
        지목 생성
      </button>
    </section>
  );
}

/** 주장·반론 타이머(ST 수동, 1분 기본) — 지목 후 지목자 주장 → 피지목자 반론. 진행 중이면 카운트다운+정지. */
function NominationTimers({
  game,
  roomId,
  run,
  busy,
}: {
  game: Game;
  roomId: string;
  run: (fn: () => Promise<{ error: string } | unknown>, refresh?: boolean) => void;
  busy: boolean;
}) {
  const rows = [
    { kind: "claim" as const, label: "주장(지목자)" },
    { kind: "rebuttal" as const, label: "반론(피지목자)" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rows.map(({ kind, label }) => {
        const t = game.phaseTimers?.[kind];
        const running = !!(t?.startedAt && !t.finishedAt);
        return running ? (
          <span key={kind} className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2 py-1 text-xs">
            <span className="font-medium">{label}</span>
            <TimerCountdown startedAt={t!.startedAt!} seconds={t!.durationSec} />
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => stopDayTimerAction(roomId, kind), true)}
              className="text-muted hover:text-red-400 disabled:opacity-40"
            >
              정지
            </button>
          </span>
        ) : (
          <button
            key={kind}
            type="button"
            disabled={busy}
            onClick={() => run(() => startDayTimerAction(roomId, kind, 60), true)}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:border-gold/50 hover:text-text disabled:opacity-40"
          >
            {label} 1분
          </button>
        );
      })}
    </div>
  );
}

/** 남은 시간 카운트다운(mm:ss). 서버 startedAt(ms) 기준 클라 시계. */
function TimerCountdown({ startedAt, seconds }: { startedAt: number; seconds: number }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil(seconds - (Date.now() - startedAt) / 1000)));
  useEffect(() => {
    const id = setInterval(
      () => setLeft(Math.max(0, Math.ceil(seconds - (Date.now() - startedAt) / 1000))),
      500,
    );
    return () => clearInterval(id);
  }, [startedAt, seconds]);
  return (
    <span className={`tabular-nums ${left <= 5 ? "text-red-400" : "text-gold"}`}>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}
