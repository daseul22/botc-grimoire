"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ALIGN_COLOR, TEAM_MAP } from "@/lib/constants";
import { dayActionSpec } from "@/lib/night-actions";
import { autoRectSides, circlePositions, rectPositions, sidesTotal, type RectSides } from "@/lib/seat-layout";
import type { Character, Game, GameActionRun } from "@/lib/types";
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
import { GrimoireLegend } from "./GrimoireLegend";
import { StatusBar } from "./StatusBar";
import { SidebarTabs, type SidebarKey } from "./SidebarTabs";
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
  toggleGhostVoteAction,
  toggleMarkerAction,
} from "@/app/play/actions";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * 트랜지션 pending을 "지연 반영"해 버튼 깜빡임을 없앤다.
 * 로컬 서버 액션은 보통 수십 ms라, 그 사이 모든 disabled={busy} 버튼이 잠깐 흐려졌다
 * 돌아오며 깜빡인다. active가 delayMs 이상 지속될 때만 true를 반환해, 빠른 액션은
 * 시각적 비활성 전환 없이 지나가고 진짜 느린 액션만 비활성 표시한다.
 * (더블클릭 방지는 시각이 아니라 run의 inFlight ref가 담당.)
 */
function useDelayedFlag(active: boolean, delayMs = 140): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  // active가 풀리면 즉시 false로(다음 렌더). setState-in-effect 회피용 파생.
  if (!active && shown) setShown(false);
  return active && shown;
}

export function PlayCanvas({
  game: initial,
  sheetChars,
  knownNicknames = [],
}: {
  game: Game;
  sheetChars: Character[];
  knownNicknames?: string[];
}) {
  const [game, setGame] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [modalChar, setModalChar] = useState<Character | null>(null);
  const [sidebar, setSidebar] = useState<SidebarKey | null>(
    initial.phase === "night" ? "night" : "day",
  );
  const toggleSidebar = (key: SidebarKey) => setSidebar((s) => (s === key ? null : key));
  const [pending, startTransition] = useTransition();
  // 깜빡임 제거용: pending을 지연 반영(빠른 액션은 비활성 표시 자체를 건너뜀).
  const busy = useDelayedFlag(pending);
  // 더블클릭/중복 제출 방지 — 시각적 disabled에 의존하지 않고 즉시(동기)로 막는다.
  const inFlight = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ seat: number; sx: number; sy: number; moved: boolean } | null>(null);

  const charMap = useMemo(
    () => Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>,
    [sheetChars],
  );

  // 페이즈가 바뀌면(다음/이전 이동 포함) 그 페이즈의 행동 순서 사이드바를 자동으로 연다.
  const phaseKey = `${game.day}-${game.phase}`;
  const prevPhaseKey = useRef(phaseKey);
  useEffect(() => {
    if (prevPhaseKey.current === phaseKey) return;
    prevPhaseKey.current = phaseKey;
    setSidebar(game.phase === "night" ? "night" : "day");
  }, [phaseKey, game.phase]);

  // 전체화면(첩자용 그리모어): 보드만 네이티브 풀스크린으로 띄우고 토큰을 1.8배. Esc로 원복.
  const [fs, setFs] = useState(false);
  const [spyView, setSpyView] = useState(false); // 전체화면 전용: 첩자 좌석을 아래로 회전
  useEffect(() => {
    const sync = () => {
      const on = !!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement);
      setFs(on);
      if (!on) setSpyView(false); // 풀스크린 나가면 항상 이야기꾼 시점으로 복귀
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  const toggleFullscreen = () => {
    const el = boardRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    if (doc.fullscreenElement || doc.webkitFullscreenElement) (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
    else (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);
  };
  const tokenScale = fs ? 1.8 : 1;
  // 첩자 시점: 좌석 순서(이웃 관계)를 유지한 채 첩자를 6시 방향(아래)에 둔다. 전체화면에서만.
  const orderedSeats = useMemo(() => [...game.players].sort((a, b) => a.seat - b.seat), [game.players]);
  const spyIdx = orderedSeats.findIndex((p) => p.characterId === "spy");
  const spyActive = fs && spyView && spyIdx >= 0;
  // 저장된 좌표(슬롯)는 그대로 두고 좌석→슬롯 배정만 회전해 첩자를 하단 중앙 슬롯으로 보낸다.
  // 원형/사각/수동 어떤 배치든 모양을 유지한 채 회전(예전엔 무조건 원형으로 재배치해 사각이 깨졌음).
  const spyPos = useMemo(() => {
    if (!spyActive) return null;
    const slots = orderedSeats.map((o) => ({ x: o.x, y: o.y }));
    const n = slots.length;
    if (n === 0) return null;
    // 하단 중앙에 가장 가까운 슬롯(아래일수록 +, 중앙에서 벗어날수록 −).
    let b = 0;
    let best = -Infinity;
    slots.forEach((s, i) => {
      const score = s.y - Math.abs(s.x - 0.5) * 0.5;
      if (score > best) {
        best = score;
        b = i;
      }
    });
    const m: Record<number, { x: number; y: number }> = {};
    orderedSeats.forEach((o, i) => {
      m[o.seat] = slots[(((i - spyIdx + b) % n) + n) % n];
    });
    return m;
  }, [spyActive, orderedSeats, spyIdx]);

  // 선택 패널이 떠 있을 때 패널·토큰 바깥을 누르면 선택 해제(자동 닫기). 토큰 클릭은 토큰 핸들러가 처리.
  useEffect(() => {
    if (selected == null) return;
    const onDocDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      // 토큰·패널·모달(직업 선택 등, body로 portal됨) 안을 누르면 닫지 않는다.
      if (
        t?.closest("[data-token]") ||
        t?.closest("[data-selection-panel]") ||
        t?.closest("[data-modal]")
      )
        return;
      setSelected(null);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [selected]);

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

  const run: GameActionRun = (fn) => {
    if (inFlight.current) return; // 진행 중이면 중복 제출 무시(더블클릭 방지)
    inFlight.current = true;
    startTransition(async () => {
      try {
        const r = await withTimeout(fn());
        if ("error" in r) alert(r.error);
        else setGame(r);
      } catch (e) {
        alert(e instanceof Error ? e.message : "요청이 실패했습니다.");
      } finally {
        inFlight.current = false;
      }
    });
  };

  // 마커를 여러 좌석에 순차 적용(add-only). state가 페이즈당 단일 JSON이라
  // 동시 호출 시 lost-update가 나므로 await로 직렬 처리한다.
  const applyMarkers = (seats: number[], markerStr: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
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
      } finally {
        inFlight.current = false;
      }
    });
  };

  // 좌표 저장은 낙관적(서버 재조정 없음, 잦은 드래그라 Game 왕복 없음). fire-and-forget이지만
  // 실패를 .catch로 잡아 unhandled rejection을 막고 콘솔에 남긴다(저장 실패 시 새로고침하면 이전 위치).
  const persistPositions = (positions: { seat: number; x: number; y: number }[]) => {
    void savePositionsAction(game.id, positions).catch((e) => console.error("좌표 저장 실패", e));
  };

  // 좌표 일괄 적용 + 저장 (원형/사각 공용)
  const applyPositions = (positions: { seat: number; x: number; y: number }[]) => {
    setGame((g) => ({
      ...g,
      players: g.players.map((p) => {
        const pos = positions.find((x) => x.seat === p.seat);
        return pos ? { ...p, x: pos.x, y: pos.y } : p;
      }),
    }));
    persistPositions(positions);
  };

  // 토큰을 원형으로 자동 배치
  const arrangeCircle = () => {
    const pts = circlePositions(game.players.length);
    applyPositions(game.players.map((p, i) => ({ seat: p.seat, x: pts[i].x, y: pts[i].y })));
  };

  // 토큰을 사각 둘레로 배치. sides 미지정이면 인원수 기준 자동 배분.
  const arrangeRect = (sides?: RectSides) => {
    const ordered = [...game.players].sort((a, b) => a.seat - b.seat);
    const s = sides ?? autoRectSides(ordered.length);
    if (sidesTotal(s) !== ordered.length) return; // 면별 합 ≠ 인원이면 무시(UI에서 막음)
    const pts = rectPositions(s);
    applyPositions(ordered.map((p, i) => ({ seat: p.seat, x: pts[i].x, y: pts[i].y })));
  };

  function onDown(e: React.PointerEvent, seat: number) {
    press.current = { seat, sx: e.clientX, sy: e.clientY, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent, locked: boolean) {
    const p = press.current;
    if (!p || locked || fs) return; // 전체화면(첩자 발표 모드)에선 위치 고정 — 저장 좌표 오염 방지
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
      if (pl) persistPositions([{ seat: p.seat, x: pl.x, y: pl.y }]);
    } else {
      setSelected((s) => (s === p.seat ? null : p.seat));
    }
  }

  return (
    <div className="pb-28">
      <HeaderToolbar
        game={game}
        night={night}
        busy={busy}
        run={run}
        onArrangeCircle={arrangeCircle}
        onArrangeRect={arrangeRect}
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
          busy={busy}
          onSetBluffs={(ids) => run(() => setBluffsAction(game.id, ids))}
          onSetDisguise={(seat, id) => run(() => setDisguiseAction(game.id, seat, id))}
        />
      ) : (
        <details className="mb-3 rounded-lg border border-border bg-surface/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted hover:text-text">
            1일차 밤 셋업 (읽기 전용)
            {game.bluffs.length > 0 && <span className="ml-2 opacity-70">· 블러핑 {game.bluffs.length}/3</span>}
          </summary>
          <div className="border-t border-border px-1 pt-1">
            <FirstNightSetup
              game={game}
              sheetChars={sheetChars}
              busy={busy}
              onSetBluffs={() => {}}
              onSetDisguise={() => {}}
              readonly
            />
          </div>
        </details>
      )}

      <StatusBar
        game={game}
        charMap={charMap}
        onToggleGlobal={(id) => run(() => toggleGlobalMarkerAction(game.id, id))}
      />

      {!night && (
        <TimerPanel
          game={game}
          busy={busy}
          onSetDuration={(k, s) => run(() => setTimerDurationAction(game.id, k, s))}
          onStart={(k) => run(() => startTimerAction(game.id, k))}
          onStop={(k) => run(() => stopTimerAction(game.id, k))}
          onClear={(k) => run(() => clearTimerAction(game.id, k))}
        />
      )}

      {/* 사이드바 토글 — 모바일 전용. 데스크탑은 보드 내부 absolute에 동일 정의로 다시 렌더된다. */}
      <SidebarTabs
        game={game}
        night={night}
        hasDayRoles={hasDayRoles}
        active={sidebar}
        onToggle={toggleSidebar}
        className="mb-2 flex flex-wrap gap-1 md:hidden"
      />

      <div className="flex flex-col gap-3 md:flex-row">
        {/* 좌석 캔버스: 모바일 뷰포트에선 숨김(사용자가 폰에서 운영할 때 행동 순서/주장/투표 UI에 집중) */}
        <div ref={boardRef} className="relative hidden h-[70vh] min-w-0 flex-1 touch-none overflow-hidden rounded-xl border border-border bg-surface md:block" style={{ backgroundImage: "radial-gradient(circle, rgba(212,162,58,0.06) 0%, transparent 70%)", ...(fs ? { height: "100vh", width: "100vw" } : null) }}>
          {/* 사이드바 토글 툴바 (데스크탑) — 전체화면(첩자 뷰)에선 숨겨 깔끔하게 */}
          {!fs && (
            <SidebarTabs
              game={game}
              night={night}
              hasDayRoles={hasDayRoles}
              active={sidebar}
              onToggle={toggleSidebar}
              className="absolute right-2 top-2 z-10 flex gap-1"
            />
          )}

          {/* 첩자 시점 토글 — 전체화면 + 첩자가 있을 때만 우상단. 첩자 좌석을 아래로 회전해 오프라인에서 보여주기 쉽게. */}
          {fs && spyIdx >= 0 && (
            <button
              type="button"
              onClick={() => setSpyView((v) => !v)}
              className={`absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm backdrop-blur transition-colors ${spyView ? "border-gold/60 bg-gold/15 text-gold" : "border-border bg-surface/90 text-muted hover:bg-surface-2 hover:text-text"}`}
              title={spyView ? "이야기꾼 시점으로 — 원래 배치로" : `첩자 시점으로 — ${orderedSeats[spyIdx].nickname} 좌석을 아래로 회전`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              {spyView ? "이야기꾼 시점" : "첩자 시점"}
            </button>
          )}

          {/* 전체화면 토글 — 우하단. 첩자에게 그리모어 전체를 크게 보여줄 때(Esc로 종료). */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface/90 text-muted backdrop-blur transition-colors hover:bg-surface-2 hover:text-text"
            title={fs ? "전체화면 종료 (Esc)" : "전체화면 — 첩자용 그리모어"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {fs ? (
                <>
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </>
              ) : (
                <>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </>
              )}
            </svg>
          </button>

          {/* 전체화면 첩자 그리모어 — 기호 의미 범례(좌하단). 비숙련 관전자 이해 보조. */}
          {fs && <GrimoireLegend game={game} charMap={charMap} />}

          {game.players.map((p) => {
            const ch = charMap[p.characterId];
            const dead = p.status === "dead";
            const teamColor = ch ? TEAM_MAP[ch.team]?.color : "#a39bb5";
            // 첩자 시점이면 좌석 순서대로 첩자를 6시(아래)에 두고 원형 재배치, 아니면 저장된 좌표.
            let px = p.x;
            let py = p.y;
            if (spyActive && spyPos?.[p.seat]) {
              px = spyPos[p.seat].x;
              py = spyPos[p.seat].y;
            }
            // 위장(미치광이·주정뱅이·꼭두각시): 본인이 믿는 가짜 직업. 메인 토큰엔 진짜 직업,
            // 우상단 작은 토큰에 가짜 직업을 보여줘 ST가 한눈에 파악.
            const fakeId = game.disguises?.[p.seat];
            const fakeCh = fakeId && fakeId !== p.characterId ? charMap[fakeId] : undefined;
            const fakeTeamColor = fakeCh ? TEAM_MAP[fakeCh.team]?.color : undefined;
            // 사망 원인별 중앙 글리프 — 처형/밤 살해 구분(시체매장인·점쟁이꾼 추적).
            const deathGlyph = p.deathCause === "execution" ? "☠️" : p.deathCause === "night" ? "🌙" : "✕";
            const deathTitle = p.deathCause === "execution" ? "처형됨" : p.deathCause === "night" ? "밤에 사망" : "사망";
            return (
              <div key={p.seat} data-token onPointerDown={(e) => onDown(e, p.seat)} onPointerMove={(e) => onMove(e, p.locked)} onPointerUp={onUp} className={`absolute flex touch-none select-none ${fs ? "cursor-default" : p.locked ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${selected === p.seat ? "z-10" : ""}`} style={{ left: `${px * 100}%`, top: `${py * 100}%`, transform: "translate(-50%, -50%)", transition: fs ? "left 0.45s ease, top 0.45s ease" : undefined }}>
                {/* 전체화면 시 1.8배 — 위치(translate)는 바깥, 크기(scale)는 안쪽에 둬 드래그가 안 끊기게 분리 */}
                <div className="flex flex-col items-center gap-1" style={{ transform: `scale(${tokenScale})`, transformOrigin: "center", transition: "transform 0.18s ease" }}>
                {/* relative 래퍼: 코너 뱃지가 원의 overflow-hidden에 잘리지 않도록 원과 형제로 배치 */}
                <div className="relative">
                  <div className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-bg ${dead ? "opacity-40 grayscale" : ""} ${selected === p.seat ? "ring-2 ring-gold ring-offset-2 ring-offset-surface" : ""}`} style={{ borderColor: ALIGN_COLOR[p.alignment] }}>
                    {ch?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ch.image} alt={ch.name.ko} className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <span style={{ color: teamColor }}>{ch?.name.en.charAt(0) ?? "?"}</span>
                    )}
                    {dead && <span className="absolute inset-0 flex items-center justify-center text-2xl text-red-500" title={deathTitle}>{deathGlyph}</span>}
                  </div>
                  {/* 메모 — 좌상단 */}
                  {p.memo && <span className="absolute -left-1.5 -top-1.5 rounded-full bg-surface-2 px-1.5 text-[15px]" title={p.memo}>📝</span>}
                  {/* 위장 직업 토큰 — 우상단(보라 링=위장 신호). 없으면 잠금 핀 표시 */}
                  {fakeCh ? (
                    <span className="absolute -right-2 -top-2 flex h-[33px] w-[33px] items-center justify-center overflow-hidden rounded-full border-2 bg-bg ring-1 ring-purple-400" title={`믿는 직업: ${fakeCh.name.ko}`} style={{ borderColor: fakeTeamColor }}>
                      {fakeCh.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fakeCh.image} alt="" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <span className="text-xs font-bold" style={{ color: fakeTeamColor }}>{fakeCh.name.en.charAt(0)}</span>
                      )}
                    </span>
                  ) : (
                    p.locked && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-surface-2 px-1.5 text-[15px]">📌</span>
                  )}
                  {/* 유령표 — 우하단(사망 시). 남음=금색 채움(카운팅용), 사용=흐림.
                      투표용지+체크 라인아트(앱 내 다른 SVG와 톤 통일). 사용 시 슬래시로 소진 표시. */}
                  {dead && (
                    <span
                      className="absolute -bottom-1.5 -right-1.5 flex h-[27px] w-[27px] items-center justify-center rounded-full border"
                      title={p.ghostVoteUsed ? "유령표 사용함" : "유령표 남음"}
                      style={p.ghostVoteUsed ? { background: "var(--color-surface-2)", borderColor: "var(--color-border)", opacity: 0.45 } : { background: "#d4a23a", borderColor: "#b8862a" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.ghostVoteUsed ? "var(--color-muted)" : "#241a06"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
                        <path d="m8.5 12 2.5 2.5 4.5-5" />
                        {p.ghostVoteUsed && <path d="M5 19 19 5" stroke="var(--color-muted)" />}
                      </svg>
                    </span>
                  )}
                </div>
                <span className={`truncate font-medium ${fs ? "max-w-32 text-base font-semibold" : "max-w-24 text-sm"}`}>{p.nickname}</span>
                {/* 전체화면: 진영명+직업명을 진영색 칩으로 — 비숙련 관전자가 마을/외지/하수인/악마를 색+글자로 구분 */}
                {fs && ch ? (
                  <span
                    className="max-w-40 truncate rounded-full border px-2 py-0.5 text-xs font-semibold"
                    style={{ color: teamColor, borderColor: `${teamColor}88`, background: `${teamColor}1f` }}
                  >
                    {TEAM_MAP[ch.team]?.label.ko} · {ch.name.ko}
                  </span>
                ) : (
                  <span className="max-w-24 truncate text-xs" style={{ color: teamColor }}>{ch?.name.ko ?? p.characterId}</span>
                )}
                {p.markers.length > 0 && (
                  <span className={`flex flex-wrap justify-center gap-1 ${fs ? "max-w-44" : "max-w-32"}`}>
                    {p.markers.map((m) => (
                      <MarkerToken key={m} m={m} charMap={charMap} px={fs ? 40 : 36} showLabel={fs} />
                    ))}
                  </span>
                )}
                </div>
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
            busy={busy}
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
            busy={busy}
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
            busy={busy}
            onRecordClaim={(seat, role, targets, result) => run(() => recordActionAction(game.id, seat, role, targets, result, true))}
            onClearClaim={(seat, role) => run(() => clearActionAction(game.id, seat, role, true))}
            onClose={() => setSidebar(null)}
          />
        )}

        {/* 지목·투표 사이드바 */}
        {sidebar === "votes" && !night && (
          <VotesSidebar
            game={game}
            busy={busy}
            onRecordVote={(nom, nee, votes, ex) => run(() => recordVoteAction(game.id, nom, nee, votes, ex))}
            onClearVote={(nee) => run(() => clearVoteAction(game.id, nee))}
            onToggleGhostVote={(seat, used) => run(() => toggleGhostVoteAction(game.id, seat, used))}
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
          knownNicknames={knownNicknames}
          run={run}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
