"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { TEAM_MAP, TEAMS } from "@/lib/constants";
import { DURATION_LABEL, MARKERS, parseMarker } from "@/lib/markers";
import { actionSpec, dayActionSpec } from "@/lib/night-actions";
import type { Alignment, Character, Game, NightAction } from "@/lib/types";
import { AbilityModal } from "./AbilityModal";
import { MarkerToken } from "./MarkerToken";
import { RolePickerModal } from "./RolePickerModal";
import { NightActionRow } from "./NightActionRow";
import { LunaticActionRow } from "./LunaticActionRow";
import { ClaimsSidebar } from "./ClaimsSidebar";
import { FirstNightSetup } from "./FirstNightSetup";
import { VotesSidebar } from "./VotesSidebar";
import { StatusBar } from "./StatusBar";
import {
  advancePhaseAction,
  clearActionAction,
  clearVoteAction,
  finishGameAction,
  prevPhaseAction,
  recordActionAction,
  recordVoteAction,
  redrawAction,
  savePositionsAction,
  setAlignmentAction,
  setNicknameAction,
  swapSeatsAction,
  toggleGlobalMarkerAction,
  lanUrlAction,
  setBluffsAction,
  setDisguiseAction,
  setLunaticBluffsAction,
  setLunaticMinionsAction,
  setMemoAction,
  setNoteAction,
  setRoleAction,
  setStatusAction,
  toggleDoneAction,
  toggleGhostVoteAction,
  toggleLockAction,
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

// LAN IP는 비보안 컨텍스트(http)라 navigator.clipboard가 없을 수 있다.
// 보안 컨텍스트면 Clipboard API, 아니면 execCommand 폴백. 둘 다 실패하면 수동 복사 유도.
async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

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
  const nightOrder = night
    ? (() => {
        type Role = { kind: "role"; order: number; p: (typeof game.players)[number]; na: NonNullable<NightAction> };
        type Info = { kind: "info"; order: number; infoKind: "minion" | "demon" };
        const roles: Role[] = game.players
          .map((p) => {
            const na = (isFirstNight ? charMap[p.characterId]?.firstNight : charMap[p.characterId]?.otherNight) as NightAction;
            return na ? { kind: "role" as const, order: na.order, p, na } : null;
          })
          .filter((x): x is Role => !!x);
        const items: (Role | Info)[] = [...roles];
        if (isFirstNight) {
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

  // 폰용 공유 주소(LAN)를 만들어 클립보드에 복사.
  const [share, setShare] = useState<{ url: string; copied: boolean; label: string } | null>(null);
  // 마커 대상 직업 선택 모달: 어느 마커(mad/became/gained)가 열려있는지
  const [markerPicker, setMarkerPicker] = useState<string | null>(null);
  const shareLink = async (path: string, label: string) => {
    const r = await lanUrlAction(path);
    if ("error" in r) {
      alert(r.error);
      return;
    }
    const copied = await copyText(r.url);
    setShare({ url: r.url, copied, label });
  };

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

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-border">
            <button type="button" disabled={pending || game.phaseIndex === 0} onClick={() => run(() => prevPhaseAction(game.id))} className="flex items-center gap-1 px-3 py-2 text-sm text-muted enabled:hover:bg-surface-2 enabled:hover:text-text disabled:opacity-30">
              <Chevron dir="left" /> 이전
            </button>
            <span className="h-6 w-px bg-border" />
            <button type="button" disabled={pending} onClick={() => run(() => advancePhaseAction(game.id))} className="flex items-center gap-1 bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
              다음 {night ? "낮" : "밤"} <Chevron dir="right" />
            </button>
          </div>
          <button type="button" onClick={arrangeCircle} title="토큰을 원형으로 정렬" className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text">
            ◯ 정렬
          </button>
          <button type="button" disabled={pending} onClick={() => { if (confirm("직업을 다시 추첨할까요? 현재 진행상황이 모두 초기화됩니다.")) run(() => redrawAction(game.id)); }} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50">
            재추첨
          </button>
          <button type="button" onClick={() => setShowEnd((v) => !v)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text">
            게임 종료
          </button>
          {(() => {
            // 본인 진짜 직업을 모르는 직업(미치광이·주정뱅이·꼭두각시)은 폰에 진짜 직업을 노출하면 게임이 망한다.
            // 모든 해당 좌석에 가짜 직업(disguise)이 지정돼야 직업배포·직업공유를 허용한다.
            const missing = game.players.filter(
              (p) =>
                (p.characterId === "lunatic" ||
                  p.characterId === "drunk" ||
                  p.characterId === "marionette") &&
                !game.disguises?.[p.seat],
            );
            const blocked = missing.length > 0;
            const blockTitle = blocked
              ? `가짜 직업 미지정: ${missing.map((p) => p.nickname).join(", ")} — 1일차 밤 셋업 배너에서 지정하세요`
              : undefined;
            return (
              <>
                <button type="button" disabled={blocked} onClick={() => shareLink(`/play/${game.id}/claim`, "직업배포(잠금)")} title={blockTitle ?? "자리 점유형 배포 링크 복사 — 헤더 없음, 한 명이 고르면 그 자리는 잠겨 엿보기 방지"} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted">🔒 직업배포</button>
                <button type="button" disabled={blocked} onClick={() => shareLink(`/play/${game.id}/seat`, "직업공유")} title={blockTitle ?? "자유 선택형 자리 보기 링크 복사 (헤더 있음, 재선택 가능)"} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted">📱 직업공유</button>
              </>
            );
          })()}
          <Link href="/games" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text" title="진행 화면 나가기">나가기</Link>
        </div>
      </div>

      {share && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">{share.label}</span>
          <span className={share.copied ? "text-green-400" : "text-amber-400"}>
            {share.copied ? "📋 주소 복사됨" : "복사 실패 — 아래 주소를 직접 복사하세요"}
          </span>
          <code className="select-all rounded bg-surface-2 px-2 py-1 text-xs text-text">{share.url}</code>
          <span className="text-xs text-muted">같은 WiFi 폰 브라우저에서 열어 자리(직업) 확인</span>
          <button type="button" onClick={() => setShare(null)} className="ml-auto text-muted hover:text-text" title="닫기">✕</button>
        </div>
      )}

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
                  const { p, na } = item;
                  const ch = charMap[p.characterId];
                  const dead = p.status === "dead";
                  const done = game.doneSeats.includes(p.seat);
                  return (
                    <li key={p.seat} className={`px-3 py-2 ${dead ? "opacity-45" : ""} ${done ? "opacity-55" : ""}`}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-4 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                        {ch?.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ch.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                        )}
                        <span className={`font-medium ${dead ? "line-through" : ""}`}>{p.nickname}</span>
                        <span className="text-xs" style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}>{ch?.name.ko ?? p.characterId}</span>
                        {isTainted(p.markers, game.globalMarkers) && INFO_KINDS.has(actionSpec(p.characterId).result) && <span className="rounded bg-amber-500/20 px-1 text-[10px] font-medium text-amber-400" title="취함/중독 — 거짓 정보를 줘야 합니다">⚠ 거짓</span>}
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
                          spec={actionSpec(p.characterId)}
                          players={game.players}
                          charMap={charMap}
                          record={game.actions.find((a) => a.actorSeat === p.seat && !a.bluff)}
                          busy={pending}
                          gameId={game.id}
                          onRecord={(targets, result) => run(() => recordActionAction(game.id, p.seat, p.characterId, targets, result))}
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

            {/* 1일차 밤 세팅: 닉네임 수정 + 자리(닉네임만) 교환. 직업은 좌석에 고정. */}
            {canEditRoles && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
                <span className="text-xs text-muted">닉네임</span>
                <input
                  key={`nick-${sel.seat}`}
                  defaultValue={sel.nickname}
                  onBlur={(e) => { if (e.target.value !== sel.nickname) run(() => setNicknameAction(game.id, sel.seat, e.target.value)); }}
                  placeholder={`플레이어 ${sel.seat + 1}`}
                  className="w-44 rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-gold/60"
                />
                <span className="ml-2 text-xs text-muted">자리 교환</span>
                <select
                  value=""
                  onChange={(e) => {
                    const other = Number(e.target.value);
                    if (Number.isFinite(other)) run(() => swapSeatsAction(game.id, sel.seat, other));
                    e.currentTarget.value = "";
                  }}
                  className="rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-gold/60"
                  title="이 자리의 닉네임과 다른 자리의 닉네임을 교환 (직업은 좌석 그대로)"
                >
                  <option value="">선택…</option>
                  {game.players.filter((p) => p.seat !== sel.seat).map((p) => (
                    <option key={p.seat} value={p.seat}>{p.nickname}</option>
                  ))}
                </select>
              </div>
            )}

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
              {sel.status === "dead" && (
                <>
                  <select value={sel.deathCause} onChange={(e) => run(() => setStatusAction(game.id, sel.seat, "dead", e.target.value))} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold/60" title="사망 원인">
                    <option value="">원인 미지정</option>
                    <option value="night">밤 살해</option>
                    <option value="execution">처형</option>
                    <option value="other">기타</option>
                  </select>
                  <button type="button" onClick={() => run(() => toggleGhostVoteAction(game.id, sel.seat, !sel.ghostVoteUsed))} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm" style={sel.ghostVoteUsed ? { borderColor: "var(--color-border)", opacity: 0.6 } : { borderColor: "#d4a23a88", color: "#d4a23a", background: "#d4a23a1a" }}>🗳️ {sel.ghostVoteUsed ? "유령표 사용함" : "유령표 사용 가능"}</button>
                </>
              )}
              <button type="button" onClick={() => run(() => toggleLockAction(game.id, sel.seat, !sel.locked))} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:text-text">{sel.locked ? "고정 해제" : "위치 고정"}</button>
              <button
                type="button"
                onClick={() => run(() => setAlignmentAction(game.id, sel.seat, sel.alignment === "good" ? "evil" : "good"))}
                title="진영 토글 (politician/mezepheles/cult leader 등)"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
                style={{ borderColor: ALIGN_COLOR[sel.alignment], color: ALIGN_COLOR[sel.alignment], background: `${ALIGN_COLOR[sel.alignment]}1a` }}
              >
                ⇄ {sel.alignment === "good" ? "선" : "악"} 진영
              </button>
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

              {/* 대상 직업 선택 마커: 집착 / 직업 변경 / 능력 획득 — 토큰 모달로 선택 */}
              {MARKERS.filter((m) => m.needsTarget).map((mk) => {
                const cur = sel.markers.find((x) => parseMarker(x).base === mk.id);
                const curParam = cur ? parseMarker(cur).param ?? "" : "";
                const picked = curParam ? charMap[curParam] : undefined;
                return (
                  <button
                    key={mk.id}
                    type="button"
                    onClick={() => setMarkerPicker(mk.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm hover:border-gold/60"
                    style={curParam ? { background: `${mk.color}22`, color: mk.color, borderColor: `${mk.color}88` } : { borderColor: "var(--color-border)" }}
                    title={`${mk.label} 대상 선택`}
                  >
                    {mk.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mk.icon} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: mk.color }} />
                    )}
                    {mk.label}
                    {picked ? (
                      <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                        {picked.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={picked.image} alt="" className="h-4 w-4 rounded-full object-cover" />
                        )}
                        {picked.name.ko}
                      </span>
                    ) : (
                      <span className="text-xs opacity-60">＋ 대상</span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* needsTarget 마커 모달 */}
            {MARKERS.filter((m) => m.needsTarget).map((mk) => {
              const cur = sel.markers.find((x) => parseMarker(x).base === mk.id);
              const curParam = cur ? parseMarker(cur).param ?? "" : "";
              return (
                <RolePickerModal
                  key={`pk-${mk.id}`}
                  open={markerPicker === mk.id}
                  title={`${mk.label} 대상 직업`}
                  candidates={sheetChars}
                  selected={curParam}
                  clearLabel="대상 없음"
                  onPick={(v) => {
                    // v 비어있음: 기존 마커가 있으면 제거, 없으면 대상 없이 단독 토글(노어빌리티 등).
                    // v 있음: 기존 마커가 있으면 먼저 제거하고 새 param으로 재적용(교체).
                    if (!v) {
                      run(() => toggleMarkerAction(game.id, sel.seat, cur ?? mk.id));
                    } else if (cur) {
                      run(async () => {
                        await toggleMarkerAction(game.id, sel.seat, cur);
                        return await toggleMarkerAction(game.id, sel.seat, `${mk.id}:${v}`);
                      });
                    } else {
                      run(() => toggleMarkerAction(game.id, sel.seat, `${mk.id}:${v}`));
                    }
                  }}
                  onClose={() => setMarkerPicker(null)}
                />
              );
            })}

            {/* 누적 메모 (전역) */}
            <textarea key={sel.seat} defaultValue={sel.memo} onBlur={(e) => { if (e.target.value !== sel.memo) run(() => setMemoAction(game.id, sel.seat, e.target.value)); }} placeholder="이 플레이어 메모 (게임 내내 유지)…" rows={2} className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60" />
          </div>
        </div>
      )}
    </div>
  );
}
