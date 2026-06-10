"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { TEAM_MAP } from "@/lib/constants";
import { MARKERS } from "@/lib/markers";
import { dayActionSpec } from "@/lib/night-actions";
import type { Alignment, Character, Game } from "@/lib/types";
import { AbilityModal } from "./AbilityModal";
import { MarkerToken } from "./MarkerToken";
import { TimerPanel } from "./TimerPanel";
import { SelectionPanel } from "./SelectionPanel";
import { HeaderToolbar } from "./HeaderToolbar";
import { NightSidebar } from "./NightSidebar";
import { DaySidebar } from "./DaySidebar";
import { AbilitiesSidebar } from "./AbilitiesSidebar";
import { ClaimsSidebar } from "./ClaimsSidebar";
import { FirstNightSetup } from "./FirstNightSetup";
import { VotesSidebar } from "./VotesSidebar";
import { StatusBar } from "./StatusBar";
import {
  clearActionAction,
  clearVoteAction,
  recordActionAction,
  recordVoteAction,
  savePositionsAction,
  toggleGlobalMarkerAction,
  setBluffsAction,
  setTimerDurationAction,
  startTimerAction,
  stopTimerAction,
  clearTimerAction,
  setDisguiseAction,
  setNoteAction,
  toggleMarkerAction,
} from "@/app/play/actions";

const ALIGN_COLOR: Record<Alignment, string> = { good: "#4a90d9", evil: "#d23b3b" };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export function PlayCanvas({
  game: initial,
  sheetChars,
}: {
  game: Game;
  sheetChars: Character[];
}) {
  const [game, setGame] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const [modalChar, setModalChar] = useState<Character | null>(null);
  const [sidebar, setSidebar] = useState<"night" | "day" | "abilities" | "claims" | "votes" | null>(
    initial.phase === "night" ? "night" : "day",
  );
  const [pending, startTransition] = useTransition();
  const boardRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ seat: number; sx: number; sy: number; moved: boolean } | null>(null);

  const charMap = useMemo(
    () => Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>,
    [sheetChars],
  );

  const sel = game.players.find((p) => p.seat === selected);
  const night = game.phase === "night";
  const isPast = game.phaseIndex < game.phaseCount - 1;
  const isFirstNight = game.day === 1;
  const canEditRoles = night && isFirstNight && game.phaseIndex === 0;

  // 낮 능력 토글 버튼 노출 여부 (목록 자체는 DaySidebar가 계산).
  const hasDayRoles = !night && game.players.some((p) => dayActionSpec(p.characterId) && charMap[p.characterId]);

  // 서버 액션이 응답을 영영 안 주면(서버 일시 블로킹·네트워크 단절) pending이 영구
  // true로 남아 화면이 "멈춘 것처럼" 보인다. 타임아웃을 걸어 알리고 풀어준다.
  const withTimeout = <T,>(p: Promise<T>, ms = 15000): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("서버 응답이 없습니다. 새로고침 후 다시 시도하세요.")), ms),
      ),
    ]);

  const run = (fn: () => Promise<Game | { error: string }>) =>
    startTransition(async () => {
      try {
        const r = await withTimeout(fn());
        if ("error" in r) alert(r.error);
        else setGame(r);
      } catch (e) {
        alert(e instanceof Error ? e.message : "요청이 실패했습니다.");
      }
    });

  // 마커를 여러 좌석에 순차 적용(add-only). state가 페이즈당 단일 JSON이라
  // 동시 호출 시 lost-update가 나므로 await로 직렬 처리한다.
  const applyMarkers = (seats: number[], markerStr: string) =>
    startTransition(async () => {
      try {
        let latest: Game | null = null;
        for (const seat of seats) {
          const cur = (latest?.players ?? game.players).find((p) => p.seat === seat);
          if (cur?.markers.includes(markerStr)) continue; // 이미 있으면 토글 끄지 않도록 skip
          latest = await withTimeout(toggleMarkerAction(game.id, seat, markerStr));
        }
        if (latest) setGame(latest);
      } catch (e) {
        alert(e instanceof Error ? e.message : "요청이 실패했습니다.");
      }
    });

  // 토큰을 원형으로 자동 배치
  const arrangeCircle = () => {
    const n = game.players.length;
    const positions = game.players.map((p, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { seat: p.seat, x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.42 * Math.sin(angle) };
    });
    setGame((g) => ({
      ...g,
      players: g.players.map((p) => {
        const pos = positions.find((x) => x.seat === p.seat)!;
        return { ...p, x: pos.x, y: pos.y };
      }),
    }));
    savePositionsAction(game.id, positions);
  };

  function onDown(e: React.PointerEvent, seat: number) {
    press.current = { seat, sx: e.clientX, sy: e.clientY, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent, locked: boolean) {
    const p = press.current;
    if (!p || locked) return;
    if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 5) return;
    p.moved = true;
    const rect = boardRef.current!.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setGame((g) => ({ ...g, players: g.players.map((pl) => (pl.seat === p.seat ? { ...pl, x, y } : pl)) }));
  }
  function onUp() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.moved) {
      const pl = game.players.find((x) => x.seat === p.seat);
      if (pl) savePositionsAction(game.id, [{ seat: p.seat, x: pl.x, y: pl.y }]);
    } else {
      setSelected((s) => (s === p.seat ? null : p.seat));
    }
  }

  return (
    <div className="pb-28">
      <HeaderToolbar
        game={game}
        night={night}
        busy={pending}
        run={run}
        onArrangeCircle={arrangeCircle}
      />

      <div className="mb-2 text-xs text-muted">
        {isPast ? (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-medium text-gold">과거 페이즈를 보는 중 · 수정 시 이 스냅샷에만 반영</span>
        ) : (
          <span>토큰 드래그=배치 · 클릭=상태/효과/메모/고정{canEditRoles ? " · 1일차 밤엔 직업 변경 가능" : ""}</span>
        )}
      </div>

      {/* 첫째 밤 셋업 박스 — 1일차 밤 phase 0이면 편집, 그 외엔 같은 정보를 읽기 전용으로 표시.
          접어둘 수 있게 details/summary로 감싼다. */}
      {canEditRoles ? (
        <FirstNightSetup
          game={game}
          sheetChars={sheetChars}
          busy={pending}
          onSetBluffs={(ids) => run(() => setBluffsAction(game.id, ids))}
          onSetDisguise={(seat, id) => run(() => setDisguiseAction(game.id, seat, id))}
        />
      ) : (
        <details className="mb-3 rounded-lg border border-border bg-surface/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted hover:text-text">
            🌙 1일차 밤 셋업 (읽기 전용)
            {game.bluffs.length > 0 && <span className="ml-2 opacity-70">· 블러핑 {game.bluffs.length}/3</span>}
          </summary>
          <div className="border-t border-border px-1 pt-1">
            <FirstNightSetup
              game={game}
              sheetChars={sheetChars}
              busy={pending}
              onSetBluffs={() => {}}
              onSetDisguise={() => {}}
              readonly
            />
          </div>
        </details>
      )}

      <StatusBar game={game} charMap={charMap} />

      {!night && (
        <TimerPanel
          game={game}
          busy={pending}
          onSetDuration={(k, s) => run(() => setTimerDurationAction(game.id, k, s))}
          onStart={(k) => run(() => startTimerAction(game.id, k))}
          onStop={(k) => run(() => stopTimerAction(game.id, k))}
          onClear={(k) => run(() => clearTimerAction(game.id, k))}
        />
      )}

      {/* 글로벌 마커: Vortox(전체 정보 직업 거짓) 등 게임 전체에 걸치는 효과. 항상 노출(룰 참고용). */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted">🌐 전역:</span>
        {MARKERS.filter((m) => m.scope === "global").map((m) => {
          const on = game.globalMarkers.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => run(() => toggleGlobalMarkerAction(game.id, m.id))}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
              style={on ? { background: `${m.color}22`, color: m.color, borderColor: `${m.color}88` } : { borderColor: "var(--color-border)", color: "var(--color-muted)" }}
              title={on ? `${m.label} 해제` : `${m.label} 적용`}
            >
              {m.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.icon} alt="" className="h-4 w-4 rounded-full object-cover" />
              ) : (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: m.color }}>{m.letter ?? m.label.charAt(0)}</span>
              )}
              {m.label}
            </button>
          );
        })}
      </div>


      {/* 사이드바 토글 — 모바일 전용. 데스크탑은 보드 내부 absolute에 동일하게 다시 렌더된다. */}
      <div className="mb-2 flex flex-wrap gap-1 md:hidden">
        {night ? (
          <button type="button" onClick={() => setSidebar((s) => (s === "night" ? null : "night"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "night" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>🌙 행동 순서</button>
        ) : (
          hasDayRoles && (
            <button type="button" onClick={() => setSidebar((s) => (s === "day" ? null : "day"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "day" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>☀️ 낮 능력</button>
          )
        )}
        <button type="button" onClick={() => setSidebar((s) => (s === "abilities" ? null : "abilities"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "abilities" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>📖 상세 능력</button>
        <button type="button" onClick={() => setSidebar((s) => (s === "claims" ? null : "claims"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "claims" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>🗣️ 주장{game.actions.some((a) => a.bluff) ? ` · ${game.actions.filter((a) => a.bluff).length}` : ""}</button>
        {!night && (
          <button type="button" onClick={() => setSidebar((s) => (s === "votes" ? null : "votes"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "votes" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>🗳️ 투표{game.votes.length > 0 ? ` · ${game.votes.length}` : ""}</button>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        {/* 좌석 캔버스: 모바일 뷰포트에선 숨김(사용자가 폰에서 운영할 때 행동 순서/주장/투표 UI에 집중) */}
        <div ref={boardRef} className="relative hidden h-[70vh] min-w-0 flex-1 touch-none overflow-hidden rounded-xl border border-border bg-surface md:block" style={{ backgroundImage: "radial-gradient(circle, rgba(212,162,58,0.06) 0%, transparent 70%)" }}>
          {/* 사이드바 토글 툴바 (데스크탑) */}
          <div className="absolute right-2 top-2 z-10 flex gap-1">
            {night ? (
              <button type="button" onClick={() => setSidebar((s) => (s === "night" ? null : "night"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "night" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>
                🌙 행동 순서
              </button>
            ) : (
              hasDayRoles && (
                <button type="button" onClick={() => setSidebar((s) => (s === "day" ? null : "day"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "day" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>
                  ☀️ 낮 능력
                </button>
              )
            )}
            <button type="button" onClick={() => setSidebar((s) => (s === "abilities" ? null : "abilities"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "abilities" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>
              📖 상세 능력
            </button>
            <button type="button" onClick={() => setSidebar((s) => (s === "claims" ? null : "claims"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "claims" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>
              🗣️ 주장{game.actions.some((a) => a.bluff) ? ` · ${game.actions.filter((a) => a.bluff).length}` : ""}
            </button>
            {!night && (
              <button type="button" onClick={() => setSidebar((s) => (s === "votes" ? null : "votes"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "votes" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>
                🗳️ 투표{game.votes.length > 0 ? ` · ${game.votes.length}` : ""}
              </button>
            )}
          </div>

          {game.players.map((p) => {
            const ch = charMap[p.characterId];
            const dead = p.status === "dead";
            const teamColor = ch ? TEAM_MAP[ch.team]?.color : "#a39bb5";
            return (
              <div key={p.seat} onPointerDown={(e) => onDown(e, p.seat)} onPointerMove={(e) => onMove(e, p.locked)} onPointerUp={onUp} className={`absolute flex -translate-x-1/2 -translate-y-1/2 touch-none select-none flex-col items-center gap-1 ${p.locked ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${selected === p.seat ? "z-10" : ""}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                <div className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-bg ${dead ? "opacity-40 grayscale" : ""} ${selected === p.seat ? "ring-2 ring-gold ring-offset-2 ring-offset-surface" : ""}`} style={{ borderColor: ALIGN_COLOR[p.alignment] }}>
                  {ch?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.image} alt={ch.name.ko} className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <span style={{ color: teamColor }}>{ch?.name.en.charAt(0) ?? "?"}</span>
                  )}
                  {dead && <span className="absolute inset-0 flex items-center justify-center text-2xl text-red-500">✕</span>}
                  {p.locked && <span className="absolute -right-1 -top-1 rounded-full bg-surface-2 px-1 text-[10px]">📌</span>}
                  {p.memo && <span className="absolute -left-1 -top-1 rounded-full bg-surface-2 px-1 text-[10px]" title={p.memo}>📝</span>}
                  {dead && <span className="absolute -bottom-1 -right-1 rounded-full bg-surface-2 px-1 text-[10px]" title={p.ghostVoteUsed ? "유령표 사용함" : "유령표 사용 가능"} style={{ opacity: p.ghostVoteUsed ? 0.35 : 1 }}>🗳️</span>}
                </div>
                <span className="max-w-24 truncate text-sm font-medium">{p.nickname}</span>
                <span className="max-w-24 truncate text-xs" style={{ color: teamColor }}>{ch?.name.ko ?? p.characterId}</span>
                {p.markers.length > 0 && (
                  <span className="flex max-w-32 flex-wrap justify-center gap-1">
                    {p.markers.map((m) => (
                      <MarkerToken key={m} m={m} charMap={charMap} px={36} />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 밤 행동 순서 사이드바 */}
        {sidebar === "night" && night && (
          <NightSidebar
            game={game}
            charMap={charMap}
            sheetChars={sheetChars}
            isFirstNight={isFirstNight}
            busy={pending}
            run={run}
            onApplyMarker={applyMarkers}
            onClose={() => setSidebar(null)}
          />
        )}

        {/* 낮 능력 사이드바 */}
        {sidebar === "day" && !night && (
          <DaySidebar
            game={game}
            charMap={charMap}
            busy={pending}
            run={run}
            onApplyMarker={applyMarkers}
            onClose={() => setSidebar(null)}
          />
        )}

        {/* 상세 능력 사이드바 */}
        {sidebar === "abilities" && (
          <AbilitiesSidebar
            game={game}
            charMap={charMap}
            sheetChars={sheetChars}
            onShowChar={setModalChar}
            onClose={() => setSidebar(null)}
          />
        )}

        {/* 주장(블러핑) 기록 사이드바 */}
        {sidebar === "claims" && (
          <ClaimsSidebar
            game={game}
            charMap={charMap}
            phase={game.phase ?? "night"}
            busy={pending}
            onRecordClaim={(seat, role, targets, result) => run(() => recordActionAction(game.id, seat, role, targets, result, true))}
            onClearClaim={(seat, role) => run(() => clearActionAction(game.id, seat, role, true))}
            onClose={() => setSidebar(null)}
          />
        )}

        {/* 지목·투표 사이드바 */}
        {sidebar === "votes" && !night && (
          <VotesSidebar
            game={game}
            busy={pending}
            onRecordVote={(nom, nee, votes, ex) => run(() => recordVoteAction(game.id, nom, nee, votes, ex))}
            onClearVote={(nee) => run(() => clearVoteAction(game.id, nee))}
            onClose={() => setSidebar(null)}
          />
        )}
      </div>

      {modalChar && <AbilityModal character={modalChar} onClose={() => setModalChar(null)} />}

      {/* 선택된 플레이어 컨트롤 — 닉네임/직업/사망/마커/메모 등 좌석 단위 액션 모두. */}
      {sel && (
        <SelectionPanel
          sel={sel}
          game={game}
          charMap={charMap}
          sheetChars={sheetChars}
          canEditRoles={canEditRoles}
          run={run}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
