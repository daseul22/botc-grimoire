"use client";

import { useEffect, useRef, useState } from "react";
import type { Game, PhaseTimer } from "@/lib/types";

// 타이머 종료 알림음 — Web Audio 비프 3회. AudioContext는 첫 호출 때 생성(사용자 제스처 이후라 OK).
let audioCtx: AudioContext | null = null;
function beep() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.3);
    }
  } catch {
    /* 오디오 차단 환경 무시 */
  }
}

/**
 * 낮 페이즈 타이머 — 밀담(생존*30초) / 공개토론(생존*15초) 기본값.
 * 실제 시간은 ST가 수동 조정 가능, 시작/정지 가능. 페이즈별 기록(game_phases.timers)으로 복기에 남는다.
 */
export function TimerPanel({
  game,
  busy,
  onSetDuration,
  onStart,
  onStop,
  onClear,
}: {
  game: Game;
  busy: boolean;
  onSetDuration: (kind: "whisper" | "open", sec: number) => void;
  onStart: (kind: "whisper" | "open") => void;
  onStop: (kind: "whisper" | "open") => void;
  onClear: (kind: "whisper" | "open") => void;
}) {
  // 카운트다운 표시용 시계 — 250ms 마다 now 갱신, 시계 기반(폰 잠금 후에도 정확).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const aliveCount = game.players.filter((p) => p.status !== "dead").length;
  const defaultFor = (kind: "whisper" | "open") =>
    aliveCount * (kind === "whisper" ? 30 : 15);

  return (
    <div className="mb-3 flex flex-wrap items-stretch gap-2">
      {(["whisper", "open"] as const).map((kind) => {
        const t = game.phaseTimers?.[kind];
        const label = kind === "whisper" ? "밀담" : "공개토론";
        const def = defaultFor(kind);
        const duration = t?.durationSec ?? def;
        return (
          <TimerCard
            key={kind}
            kind={kind}
            label={label}
            durationSec={duration}
            isDefault={!t || t.durationSec === 0}
            timer={t}
            now={now}
            busy={busy}
            onSetDuration={(sec) => onSetDuration(kind, sec)}
            onStart={() => {
              // 시작 시 듀레이션 미설정이면 자동 기본값.
              if (!t?.durationSec) onSetDuration(kind, def);
              onStart(kind);
            }}
            onStop={() => onStop(kind)}
            onClear={() => onClear(kind)}
          />
        );
      })}
    </div>
  );
}

function TimerCard({
  label,
  durationSec,
  isDefault,
  timer,
  now,
  busy,
  onSetDuration,
  onStart,
  onStop,
  onClear,
}: {
  kind: "whisper" | "open";
  label: string;
  durationSec: number;
  isDefault: boolean;
  timer: PhaseTimer | undefined;
  now: number;
  busy: boolean;
  onSetDuration: (sec: number) => void;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
}) {
  const running = !!timer?.startedAt && !timer.finishedAt;
  const finished = !!timer?.finishedAt;
  const elapsed = running ? Math.floor((now - (timer?.startedAt ?? now)) / 1000) : 0;
  const remaining = Math.max(0, durationSec - elapsed);
  const overtime = running && remaining === 0 ? Math.floor((now - (timer?.startedAt ?? now)) / 1000) - durationSec : 0;

  // 0초 도달 순간 1회: 비프 + 진동(폰) — 같은 startedAt에 대해 중복 알림 방지.
  const alerted = useRef<number | null>(null);
  useEffect(() => {
    if (!running || remaining > 0) return;
    const key = timer?.startedAt ?? 0;
    if (alerted.current === key) return;
    alerted.current = key;
    beep();
    try {
      navigator.vibrate?.([200, 100, 200, 100, 400]);
    } catch {
      /* ignore */
    }
  }, [running, remaining, timer?.startedAt]);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // 시간 초과 동안 테두리 깜빡 (1초 주기)
  const flashing = running && remaining === 0 && Math.floor(now / 500) % 2 === 0;

  return (
    <div
      className="flex min-w-[180px] flex-1 flex-col gap-1.5 rounded-lg border bg-surface px-3 py-2 transition-colors"
      style={{ borderColor: flashing ? "#d23b3b" : "var(--color-border)", background: flashing ? "#d23b3b14" : undefined }}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        {finished && <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted">완료</span>}
        {running && remaining > 0 && (
          <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-400">진행 중</span>
        )}
        {running && remaining === 0 && (
          <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400">시간 초과</span>
        )}
        {!running && !finished && isDefault && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">기본값</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span
          className="font-mono text-2xl tabular-nums"
          style={{ color: running && remaining === 0 ? "#d23b3b" : undefined }}
        >
          {running ? fmt(remaining) : fmt(durationSec)}
        </span>
        {overtime > 0 && (
          <span className="font-mono text-xs text-red-400">+{fmt(overtime)}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {!running ? (
          <button
            type="button"
            disabled={busy}
            onClick={onStart}
            className="rounded bg-gold/15 px-2 py-0.5 text-xs text-gold hover:bg-gold/25"
          >
            ▶ 시작
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onStop}
            className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/25"
          >
            ■ 정지
          </button>
        )}
        <input
          type="number"
          min={0}
          step={5}
          disabled={busy || running}
          defaultValue={durationSec}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 0 && v !== durationSec) onSetDuration(v);
          }}
          className="w-16 rounded border border-border bg-bg px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-gold/60"
          title="초 단위 (수동 조정)"
        />
        <span className="text-[10px] text-muted">초</span>
        {(running || finished) && (
          <button
            type="button"
            disabled={busy}
            onClick={onClear}
            className="ml-auto text-xs text-muted hover:text-text"
            title="기록 삭제 + 듀레이션 리셋"
          >
            ↺ 리셋
          </button>
        )}
      </div>
    </div>
  );
}
