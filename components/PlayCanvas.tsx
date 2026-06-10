"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { TEAM_MAP, TEAMS } from "@/lib/constants";
import { MARKERS, effectiveCharacterId, parseMarker } from "@/lib/markers";
import { actionSpec, dayActionSpec } from "@/lib/night-actions";
import type { Alignment, Character, Game, NightAction } from "@/lib/types";
import { AbilityModal } from "./AbilityModal";
import { MarkerToken } from "./MarkerToken";
import { NightActionRow } from "./NightActionRow";
import { LunaticActionRow } from "./LunaticActionRow";
import { TimerPanel } from "./TimerPanel";
import { SelectionPanel } from "./SelectionPanel";
import { HeaderToolbar } from "./HeaderToolbar";
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
  setLunaticBluffsAction,
  setLunaticMinionsAction,
  setNoteAction,
  toggleDoneAction,
  toggleMarkerAction,
} from "@/app/play/actions";

const ALIGN_COLOR: Record<Alignment, string> = { good: "#4a90d9", evil: "#d23b3b" };
const TEAM_ORDER = TEAMS.map((t) => t.id);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// 거짓 정보 경고: 정보 결과 직업이 취함/중독이면 거짓 정보를 줘야 함
const INFO_KINDS = new Set(["number", "yesno", "role", "team"]);
// taints: 정보 직업이 거짓 정보를 받아야 하는 상태. markers.ts에서 taints:true인 마커 목록.
const TAINT_BASES = new Set(MARKERS.filter((m) => m.taints).map((m) => m.id));
const hasTaintInList = (markers: string[]) =>
  markers.some((m) => TAINT_BASES.has(parseMarker(m).base));
const isTainted = (seatMarkers: string[], globalMarkers: string[]) =>
  hasTaintInList(seatMarkers) || hasTaintInList(globalMarkers);

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

  // 첫밤 ST 운영서 별도 단계로 진행되는 두 정보 노드(botc 공식 firstNight order 기준).
  // 룰상 마술사(magician=18) → MINION_INFO → 미치광이(lunatic=21) → DEMON_INFO 순.
  // - MINION_INFO=19: 마술사 다음, 미치광이 전. 하수인끼리 + 데몬 알려줌.
  // - DEMON_INFO=22: 미치광이 다음. 데몬에게 자기 직업·블러핑·하수인 알려줌.
  // 일부 직업(철학자=14, 세레노버스=42 등)은 이 노드 앞·뒤에 위치한다.
  // 좌석마다 실제 운영상 어떤 직업으로 다루는지(disguise / gained / became 마커 반영).
  // 미치광이는 데몬처럼, 식인종은 처형된 town 능력처럼, 임프 자살자는 새 직업으로 행동 순서에 노출.
  const effectiveCharId = (p: (typeof game.players)[number]) =>
    effectiveCharacterId(p.seat, p.characterId, p.markers, game.disguises);

  const nightOrder = night
    ? (() => {
        type Role = { kind: "role"; order: number; p: (typeof game.players)[number]; effId: string; na: NonNullable<NightAction> };
        type Info = { kind: "info"; order: number; infoKind: "minion" | "demon" };
        const roles: Role[] = game.players
          .map((p) => {
            const effId = effectiveCharId(p);
            const na = (isFirstNight ? charMap[effId]?.firstNight : charMap[effId]?.otherNight) as NightAction;
            return na ? { kind: "role" as const, order: na.order, p, effId, na } : null;
          })
          .filter((x): x is Role => !!x);
        const items: (Role | Info)[] = [...roles];
        if (isFirstNight) {
          // 정보 노드는 *실제* 게임 구성에 따라 노출 (effective char 무관).
          const hasMinion = game.players.some((p) => charMap[p.characterId]?.team === "minion");
          const hasDemon = game.players.some((p) => charMap[p.characterId]?.team === "demon");
          if (hasMinion) items.push({ kind: "info", order: 19, infoKind: "minion" });
          if (hasDemon) items.push({ kind: "info", order: 22, infoKind: "demon" });
        }
        return items.sort((a, b) => a.order - b.order);
      })()
    : [];

  const dayRoles = !night
    ? game.players
        .map((p) => ({ p, ch: charMap[p.characterId], spec: dayActionSpec(p.characterId) }))
        .filter((x): x is { p: (typeof game.players)[number]; ch: Character; spec: NonNullable<ReturnType<typeof dayActionSpec>> } => !!x.spec && !!x.ch)
        .sort((a, b) => TEAM_ORDER.indexOf(a.ch.team) - TEAM_ORDER.indexOf(b.ch.team) || a.ch.name.ko.localeCompare(b.ch.name.ko, "ko"))
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

  // 마커를 여러 좌석에 순차 적용(add-only). state가 페이즈당 단일 JSON이라
  // 동시 호출 시 lost-update가 나므로 await로 직렬 처리한다.
  const applyMarkers = (seats: number[], markerStr: string) =>
    startTransition(async () => {
      let latest: Game | null = null;
      for (const seat of seats) {
        const cur = (latest?.players ?? game.players).find((p) => p.seat === seat);
        if (cur?.markers.includes(markerStr)) continue; // 이미 있으면 토글 끄지 않도록 skip
        latest = await toggleMarkerAction(game.id, seat, markerStr);
      }
      if (latest) setGame(latest);
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
          dayRoles.length > 0 && (
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
              dayRoles.length > 0 && (
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
          <aside className="flex h-[70vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:w-72">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-sm font-semibold">🌙 {isFirstNight ? "첫째 밤" : "그 외 밤"} 행동 순서<span className="ml-1 font-normal text-muted">· {nightOrder.length}</span></span>
              <button type="button" onClick={() => setSidebar(null)} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"><Chevron dir="right" /></button>
            </div>
            {nightOrder.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">이 밤에 행동하는 직업이 없습니다.</p>
            ) : (
              <ol className="flex-1 divide-y divide-border overflow-y-auto">
                {nightOrder.map((item, i) => {
                  if (item.kind === "info") {
                    // 데몬 좌석 — 보여주기는 데몬 본인 폰에 노출. 데몬이 여럿이면 첫 번째 사용.
                    const demonSeat = game.players.find((x) => charMap[x.characterId]?.team === "demon")?.seat;
                    const isMinion = item.infoKind === "minion";
                    return (
                      <li key={`info-${item.infoKind}`} className="bg-surface-2/40 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="w-4 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={isMinion ? "/icons/minion-info.png" : "/icons/demon-info.png"} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                          <span className="font-semibold" style={{ color: isMinion ? "#d23b3b" : "#d23b3b" }}>
                            {isMinion ? "하수인 정보" : "악마 정보"}
                          </span>
                          <span className="text-xs text-muted">단계</span>
                          {demonSeat != null && (
                            <a
                              href={`/play/${game.id}/show/${demonSeat}?mode=${isMinion ? "minions" : "bluffs"}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto inline-flex items-center gap-1 rounded bg-gold/15 px-1.5 py-0.5 text-xs text-gold hover:bg-gold/25"
                            >
                              🎴 보여주기
                            </a>
                          )}
                        </div>
                        <p className="mt-1 break-words pl-6 text-xs text-muted">
                          {isMinion
                            ? "하수인들에게 서로 누구인지, 데몬이 누구인지 알려줍니다. (꼭두각시·마술사 인플레이 시 변형 적용)"
                            : "데몬에게 자기 직업·블러핑 3개·하수인 좌석을 알려줍니다."}
                        </p>
                      </li>
                    );
                  }
                  const { p, na, effId } = item;
                  // ch = 운영상 다루는 직업(가짜/획득), realCh = 좌석에 적힌 진짜 직업.
                  const ch = charMap[effId];
                  const realCh = effId !== p.characterId ? charMap[p.characterId] : undefined;
                  const dead = p.status === "dead";
                  const done = game.doneSeats.includes(p.seat);
                  return (
                    <li key={p.seat} className={`px-3 py-2 ${dead ? "opacity-45" : ""} ${done ? "opacity-55" : ""}`}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-4 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                        <span className="relative inline-flex shrink-0">
                          {ch?.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ch.image} alt="" className="h-6 w-6 rounded-full object-cover" />
                          )}
                          {realCh?.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={realCh.image}
                              alt=""
                              title={`원래 직업: ${realCh.name.ko}`}
                              className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-bg object-cover ring-1 ring-border"
                            />
                          )}
                        </span>
                        <span className={`font-medium ${dead ? "line-through" : ""}`}>{p.nickname}</span>
                        <span className="text-xs" style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}>{ch?.name.ko ?? effId}</span>
                        {realCh && <span className="rounded bg-purple-500/15 px-1 py-0.5 text-[10px] font-medium text-purple-300" title={`실제 직업: ${realCh.name.ko}`}>←{realCh.name.ko}</span>}
                        {isTainted(p.markers, game.globalMarkers) && INFO_KINDS.has(actionSpec(effId).result) && <span className="rounded bg-amber-500/20 px-1 text-[10px] font-medium text-amber-400" title="취함/중독 — 거짓 정보를 줘야 합니다">⚠ 거짓</span>}
                        {dead && <span className="text-xs text-red-400">사망</span>}
                        <button type="button" title={done ? "처리 완료 해제" : "처리 완료"} onClick={() => run(() => toggleDoneAction(game.id, p.seat))} className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${done ? "border-green-500 bg-green-500/20 text-green-400" : "border-border text-muted hover:border-green-500/60"}`}>✓</button>
                      </div>
                      {na.reminder?.ko && <p className="mt-1 whitespace-pre-line break-words pl-6 text-xs text-muted">{na.reminder.ko}</p>}
                      {p.characterId === "lunatic" ? (
                        <LunaticActionRow
                          gameId={game.id}
                          game={game}
                          actorSeat={p.seat}
                          sheetChars={sheetChars}
                          charMap={charMap}
                          busy={pending}
                          onSetBluffs={(ids) => run(() => setLunaticBluffsAction(game.id, ids))}
                          onSetMinions={(seats) => run(() => setLunaticMinionsAction(game.id, seats))}
                        />
                      ) : (
                        <NightActionRow
                          actor={p}
                          spec={actionSpec(effId)}
                          players={game.players}
                          charMap={charMap}
                          record={game.actions.find((a) => a.actorSeat === p.seat && !a.bluff)}
                          busy={pending}
                          gameId={game.id}
                          onRecord={(targets, result) => run(() => recordActionAction(game.id, p.seat, effId, targets, result))}
                          onClear={() => run(() => clearActionAction(game.id, p.seat))}
                          onApplyMarker={applyMarkers}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        )}

        {/* 낮 능력 사이드바 */}
        {sidebar === "day" && !night && (
          <aside className="flex h-[70vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:w-72">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-sm font-semibold">☀️ 낮 능력<span className="ml-1 font-normal text-muted">· {dayRoles.length}</span></span>
              <button type="button" onClick={() => setSidebar(null)} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"><Chevron dir="right" /></button>
            </div>
            {dayRoles.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">낮에 쓰는 능력을 가진 직업이 없습니다.</p>
            ) : (
              <ol className="flex-1 divide-y divide-border overflow-y-auto">
                {dayRoles.map(({ p, ch, spec }) => {
                  const dead = p.status === "dead";
                  const done = game.doneSeats.includes(p.seat);
                  return (
                    <li key={p.seat} className={`px-3 py-2 ${dead ? "opacity-45" : ""} ${done ? "opacity-55" : ""}`}>
                      <div className="flex items-center gap-2 text-sm">
                        {ch.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ch.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                        )}
                        <span className={`font-medium ${dead ? "line-through" : ""}`}>{p.nickname}</span>
                        <span className="text-xs" style={{ color: TEAM_MAP[ch.team]?.color }}>{ch.name.ko}</span>
                        {isTainted(p.markers, game.globalMarkers) && INFO_KINDS.has(spec.result) && <span className="rounded bg-amber-500/20 px-1 text-[10px] font-medium text-amber-400" title="취함/중독 — 거짓 정보를 줘야 합니다">⚠ 거짓</span>}
                        {dead && <span className="text-xs text-red-400">사망</span>}
                        <button type="button" title={done ? "처리 완료 해제" : "처리 완료"} onClick={() => run(() => toggleDoneAction(game.id, p.seat))} className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${done ? "border-green-500 bg-green-500/20 text-green-400" : "border-border text-muted hover:border-green-500/60"}`}>✓</button>
                      </div>
                      <p className="mt-1 break-words pl-0.5 text-xs text-muted">{ch.ability.ko}</p>
                      <NightActionRow
                        actor={p}
                        spec={spec}
                        players={game.players}
                        charMap={charMap}
                        record={game.actions.find((a) => a.actorSeat === p.seat && !a.bluff)}
                        busy={pending}
                        gameId={game.id}
                        onRecord={(targets, result) => run(() => recordActionAction(game.id, p.seat, p.characterId, targets, result))}
                        onClear={() => run(() => clearActionAction(game.id, p.seat))}
                        onApplyMarker={applyMarkers}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        )}

        {/* 상세 능력 사이드바 */}
        {sidebar === "abilities" && (
          <aside className="flex h-[70vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:w-72">
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
