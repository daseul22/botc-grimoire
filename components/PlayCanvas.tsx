"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { TEAM_MAP, TEAMS } from "@/lib/constants";
import { DURATION_LABEL, MARKERS, markerInfo, parseMarker } from "@/lib/markers";
import type { Alignment, Character, Game, NightAction } from "@/lib/types";
import { AbilityModal } from "./AbilityModal";
import {
  advancePhaseAction,
  finishGameAction,
  prevPhaseAction,
  redrawAction,
  savePositionsAction,
  setMemoAction,
  setRoleAction,
  setStatusAction,
  toggleLockAction,
  toggleMarkerAction,
} from "@/app/play/actions";

const ALIGN_COLOR: Record<Alignment, string> = { good: "#4a90d9", evil: "#d23b3b" };
const TEAM_ORDER = TEAMS.map((t) => t.id);
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
  const [showRoles, setShowRoles] = useState(false);
  const [modalChar, setModalChar] = useState<Character | null>(null);
  const [sidebar, setSidebar] = useState<"night" | "abilities" | null>(
    initial.phase === "night" ? "night" : null,
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

  const nightOrder = night
    ? game.players
        .map((p) => ({
          p,
          na: (isFirstNight ? charMap[p.characterId]?.firstNight : charMap[p.characterId]?.otherNight) as NightAction,
        }))
        .filter((x): x is { p: (typeof game.players)[number]; na: NonNullable<NightAction> } => !!x.na)
        .sort((a, b) => a.na.order - b.na.order)
    : [];

  const { inPlayRoles, otherRoles } = useMemo(() => {
    const sortFn = (a: Character, b: Character) =>
      TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) ||
      a.name.ko.localeCompare(b.name.ko, "ko");
    const inPlaySet = new Set(game.players.map((p) => p.characterId));
    const seen = new Set<string>();
    const inPlay: Character[] = [];
    for (const p of game.players) {
      const c = charMap[p.characterId];
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        inPlay.push(c);
      }
    }
    const others = sheetChars.filter((c) => !inPlaySet.has(c.id)).slice();
    return { inPlayRoles: inPlay.sort(sortFn), otherRoles: others.sort(sortFn) };
  }, [game.players, charMap, sheetChars]);

  const roleItem = (c: Character, dim: boolean) => (
    <li key={c.id} className={dim ? "opacity-50" : ""}>
      <button
        type="button"
        onClick={() => setModalChar(c)}
        className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
      >
        {c.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium" style={{ color: TEAM_MAP[c.team]?.color }}>
            {c.name.ko}
          </span>
          <span className="block break-words text-xs text-muted">{c.ability.ko}</span>
        </span>
      </button>
    </li>
  );

  const run = (fn: () => Promise<Game | { error: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) alert(r.error);
      else setGame(r);
    });

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

  const madMarker = sel?.markers.find((m) => parseMarker(m).base === "mad");
  const madTarget = madMarker ? parseMarker(madMarker).param ?? "" : "";

  return (
    <div className="pb-28">
      {/* 페이즈 헤더 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style={{ background: night ? "#4a90d918" : "#d4a23a18", border: `1px solid ${night ? "#4a90d955" : "#d4a23a55"}` }}>
            {night ? "🌙" : "☀️"}
          </div>
          <div>
            <p className="text-xs text-muted">{game.sheetName}</p>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{game.day}일차 {night ? "밤" : "낮"}</h1>
              <span className="text-xs text-muted">스냅샷 {game.phaseIndex + 1}/{game.phaseCount}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-border">
            <button type="button" disabled={pending || game.phaseIndex === 0} onClick={() => run(() => prevPhaseAction(game.id))} className="flex items-center gap-1 px-3 py-2 text-sm text-muted enabled:hover:bg-surface-2 enabled:hover:text-text disabled:opacity-30">
              <Chevron dir="left" /> 이전
            </button>
            <span className="h-6 w-px bg-border" />
            <button type="button" disabled={pending} onClick={() => run(() => advancePhaseAction(game.id))} className="flex items-center gap-1 bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
              다음 {night ? "낮" : "밤"} <Chevron dir="right" />
            </button>
          </div>
          <button type="button" disabled={pending} onClick={() => { if (confirm("직업을 다시 추첨할까요? 현재 진행상황이 모두 초기화됩니다.")) run(() => redrawAction(game.id)); }} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50">
            재추첨
          </button>
          <button type="button" onClick={() => setShowEnd((v) => !v)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text">
            게임 종료
          </button>
          <Link href="/games" className="rounded-lg px-2 py-2 text-sm text-muted hover:text-text">나가기</Link>
        </div>
      </div>

      {showEnd && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
          <span className="text-sm text-muted">승리 진영:</span>
          <button type="button" disabled={pending} onClick={() => startTransition(() => finishGameAction(game.id, "good"))} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "#4a90d922", color: "#4a90d9" }}>선 진영 승리</button>
          <button type="button" disabled={pending} onClick={() => startTransition(() => finishGameAction(game.id, "evil"))} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "#d23b3b22", color: "#d23b3b" }}>악 진영 승리</button>
          <button type="button" onClick={() => setShowEnd(false)} className="ml-auto text-sm text-muted hover:text-text">취소</button>
        </div>
      )}

      <div className="mb-2 text-xs text-muted">
        {isPast ? (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-medium text-gold">과거 페이즈를 보는 중 · 수정 시 이 스냅샷에만 반영</span>
        ) : (
          <span>토큰 드래그=배치 · 클릭=상태/효과/메모/고정{canEditRoles ? " · 1일차 밤엔 직업 변경 가능" : ""}</span>
        )}
      </div>

      <div className="flex gap-3">
        <div ref={boardRef} className="relative h-[70vh] min-w-0 flex-1 touch-none overflow-hidden rounded-xl border border-border bg-surface" style={{ backgroundImage: "radial-gradient(circle, rgba(212,162,58,0.06) 0%, transparent 70%)" }}>
          {/* 사이드바 토글 툴바 */}
          <div className="absolute right-2 top-2 z-10 flex gap-1">
            {night && (
              <button type="button" onClick={() => setSidebar((s) => (s === "night" ? null : "night"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "night" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>
                🌙 행동 순서
              </button>
            )}
            <button type="button" onClick={() => setSidebar((s) => (s === "abilities" ? null : "abilities"))} className={`rounded-lg border px-2.5 py-1.5 text-sm backdrop-blur ${sidebar === "abilities" ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 hover:bg-surface-2"}`}>
              📖 상세 능력
            </button>
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
                </div>
                <span className="max-w-24 truncate text-sm font-medium">{p.nickname}</span>
                <span className="max-w-24 truncate text-xs" style={{ color: teamColor }}>{ch?.name.ko ?? p.characterId}</span>
                {p.markers.length > 0 && (
                  <span className="flex max-w-28 flex-wrap justify-center gap-1">
                    {p.markers.map((m) => {
                      const mk = markerInfo(m);
                      const { param } = parseMarker(m);
                      const title = mk?.id === "mad" && param ? `집착: ${charMap[param]?.name.ko ?? param}` : mk?.label ?? m;
                      return mk?.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={m} src={mk.icon} alt={mk.label} title={title} draggable={false} className="h-9 w-9 rounded-full border bg-bg object-cover shadow" style={{ borderColor: mk.color }} />
                      ) : (
                        <span key={m} title={title} className="h-2.5 w-2.5 rounded-full" style={{ background: mk?.color ?? "#888" }} />
                      );
                    })}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 밤 행동 순서 사이드바 */}
        {sidebar === "night" && night && (
          <aside className="flex h-[70vh] w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-sm font-semibold">🌙 {isFirstNight ? "첫째 밤" : "그 외 밤"} 행동 순서<span className="ml-1 font-normal text-muted">· {nightOrder.length}</span></span>
              <button type="button" onClick={() => setSidebar(null)} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"><Chevron dir="right" /></button>
            </div>
            {nightOrder.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">이 밤에 행동하는 직업이 없습니다.</p>
            ) : (
              <ol className="flex-1 divide-y divide-border overflow-y-auto">
                {nightOrder.map(({ p, na }, i) => {
                  const ch = charMap[p.characterId];
                  const dead = p.status === "dead";
                  return (
                    <li key={p.seat} className={`px-3 py-2 ${dead ? "opacity-45" : ""}`}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-4 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                        {ch?.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ch.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                        )}
                        <span className={`font-medium ${dead ? "line-through" : ""}`}>{p.nickname}</span>
                        <span className="text-xs" style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}>{ch?.name.ko ?? p.characterId}</span>
                        {dead && <span className="ml-auto shrink-0 text-xs text-red-400">사망</span>}
                      </div>
                      {na.reminder?.ko && <p className="mt-1 whitespace-pre-line break-words pl-6 text-xs text-muted">{na.reminder.ko}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        )}

        {/* 상세 능력 사이드바 */}
        {sidebar === "abilities" && (
          <aside className="flex h-[70vh] w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-sm font-semibold">📖 직업 능력<span className="ml-1 font-normal text-muted">· {inPlayRoles.length}</span></span>
              <button type="button" onClick={() => setSidebar(null)} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"><Chevron dir="right" /></button>
            </div>
            <ul className="flex-1 divide-y divide-border overflow-y-auto">
              {inPlayRoles.map((c) => roleItem(c, false))}
              {otherRoles.length > 0 && (
                <li className="bg-surface-2/40 px-3 py-1.5 text-[11px] font-medium text-muted">
                  시트의 다른 직업 (미사용 · {otherRoles.length})
                </li>
              )}
              {otherRoles.map((c) => roleItem(c, true))}
            </ul>
          </aside>
        )}
      </div>

      {modalChar && <AbilityModal character={modalChar} onClose={() => setModalChar(null)} />}

      {/* 선택된 플레이어 컨트롤 */}
      {sel && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">{sel.nickname}</span>
                <span className="ml-2" style={{ color: charMap[sel.characterId] ? TEAM_MAP[charMap[sel.characterId].team]?.color : undefined }}>{charMap[sel.characterId]?.name.ko ?? sel.characterId}</span>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-muted hover:text-text">닫기</button>
            </div>

            {/* 1일차 밤 직업 변경 */}
            {canEditRoles && (
              <div className="mt-2">
                <button type="button" onClick={() => setShowRoles((v) => !v)} className="text-sm text-gold hover:underline">
                  직업 변경 {showRoles ? "▾" : "▸"}
                </button>
                {showRoles && (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2">
                    <p className="mb-1.5 text-xs text-muted">다른 플레이어가 가진 직업(흐림)을 누르면 서로 교체됩니다.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sheetChars.map((c) => {
                        const mine = sel.characterId === c.id;
                        const dup = game.players.some((p) => p.seat !== sel.seat && p.characterId === c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={mine}
                            title={dup ? "교체" : c.name.ko}
                            onClick={() => run(() => setRoleAction(game.id, sel.seat, c.id))}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${mine ? "border-gold bg-gold/15 text-gold" : dup ? "border-border opacity-45 hover:opacity-80" : "border-border hover:bg-surface"}`}
                            style={{ color: mine ? undefined : TEAM_MAP[c.team]?.color }}
                          >
                            {c.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.image} alt="" className="h-4 w-4 rounded-full object-cover" />
                            )}
                            {c.name.ko}
                            {dup && !mine && <span className="text-muted">⇄</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => run(() => setStatusAction(game.id, sel.seat, sel.status === "dead" ? "alive" : "dead"))} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:text-text">{sel.status === "dead" ? "부활" : "사망 처리"}</button>
              <button type="button" onClick={() => run(() => toggleLockAction(game.id, sel.seat, !sel.locked))} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:text-text">{sel.locked ? "고정 해제" : "위치 고정"}</button>
              <span className="mx-1 text-muted">|</span>
              {MARKERS.filter((m) => !m.needsTarget).map((m) => {
                const on = sel.markers.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => run(() => toggleMarkerAction(game.id, sel.seat, m.id))} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors" style={on ? { background: `${m.color}22`, color: m.color, borderColor: `${m.color}88` } : { borderColor: "var(--color-border)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.icon} alt="" draggable={false} className="h-5 w-5 rounded-full object-cover" />
                    {m.label}
                    <span className="text-[10px] opacity-70">({DURATION_LABEL[m.duration]})</span>
                  </button>
                );
              })}

              {/* 집착 대상 */}
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm" style={madTarget ? { background: "#ec6cae22", color: "#ec6cae", borderColor: "#ec6cae88" } : { borderColor: "var(--color-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/cerenovus.webp" alt="" className="h-5 w-5 rounded-full object-cover" />
                집착
                <select value={madTarget} onChange={(e) => { const v = e.target.value; if (!v) { if (madMarker) run(() => toggleMarkerAction(game.id, sel.seat, madMarker)); } else { run(() => toggleMarkerAction(game.id, sel.seat, `mad:${v}`)); } }} className="max-w-32 rounded border border-border bg-surface px-1 py-0.5 text-xs text-text outline-none">
                  <option value="">대상 없음</option>
                  {sheetChars.map((c) => (<option key={c.id} value={c.id}>{c.name.ko}</option>))}
                </select>
              </span>
            </div>

            {/* 누적 메모 (전역) */}
            <textarea key={sel.seat} defaultValue={sel.memo} onBlur={(e) => { if (e.target.value !== sel.memo) run(() => setMemoAction(game.id, sel.seat, e.target.value)); }} placeholder="이 플레이어 메모 (게임 내내 유지)…" rows={2} className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60" />
          </div>
        </div>
      )}
    </div>
  );
}
