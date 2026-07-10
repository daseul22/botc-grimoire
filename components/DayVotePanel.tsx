"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useBackClose } from "./useBackClose";
import { useAutoAdvance } from "./useAutoAdvance";
import { useDelayedFlag } from "./useDelayedFlag";
import { useTurnAlert } from "./useTurnAlert";
import { castHandAction, nominateAction } from "@/app/rooms/actions";

// lib/nominations의 Nomination과 동일 구조(클라가 서버 모듈 import 안 하도록 로컬 정의).
export type NominationView = {
  id: string;
  day: number;
  nominator: number;
  nominee: number;
  status: "pending" | "voting" | "tallied" | "committed" | "cancelled";
  order: number[];
  pointer: number;
  step: number;
  perSeatSec: number;
  turnStartedAt: string | null;
  paused: boolean;
  /** 여행자 추방(전원 투표·유령표 무소모·추방선). false면 일반 처형 지목. */
  isExile: boolean;
  /** 비공개 투표(오르간 그라인더) — 서버가 플레이어에게 hands를 비워 보낸다. UI도 집계를 숨긴다. */
  hidden: boolean;
  hands: { seat: number; hand: 0 | 1; isGhost: boolean }[];
};

type SeatLite = { seat: number; nickname: string; status: "alive" | "dead" };

/**
 * 플레이어의 낮 지목·투표 패널. 내 차례일 때만 강제 모달(손 들기/내리기), 그 외(대기·관전·집계완료)는
 * 보드를 가리지 않는 하단 배너. 지목 없음 + 지목 가능하면 "지목하기" 버튼.
 * 투표는 공개 정보 — 누가 손을 들었는지 전원에게 보인다.
 */
export function DayVotePanel({
  nomination,
  roomId,
  boundSeat,
  players,
  me,
  myCharacterId,
  canNominate,
  nominationsOpen = false,
  nominatedSeats,
}: {
  nomination: NominationView | null;
  roomId: string;
  boundSeat: number;
  players: SeatLite[];
  me: { status: "alive" | "dead"; ghostVoteUsed: boolean };
  /** 본인 실제 직업 — 집사 등 투표 제약 소프트 안내용(강제 아님, 정체 노출 방지). */
  myCharacterId?: string;
  canNominate: boolean;
  /** ST가 '지목 받기'를 열었는가 — 안 열렸으면 대기 안내. */
  nominationsOpen?: boolean;
  nominatedSeats: number[];
}) {
  const [pending, startTransition] = useTransition();
  const busy = useDelayedFlag(pending); // 깜빡임 제거: 빠른 액션은 disabled 시각 전환 생략
  const inFlight = useRef(false); // 중복 제출 동기 차단(시각 disabled에 의존 안 함)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collapsedKey, setCollapsedKey] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const nick = (seat: number) => players.find((p) => p.seat === seat)?.nickname ?? `${seat}번`;
  const upCount = nomination ? nomination.hands.filter((h) => h.hand === 1).length : 0;
  const upNames = nomination
    ? nomination.hands.filter((h) => h.hand === 1).map((h) => nick(h.seat))
    : [];

  const curSeat = nomination && nomination.status === "voting" ? nomination.order[nomination.pointer] : undefined;
  const myTurn = curSeat === boundSeat;
  const myHand = nomination?.hands.find((h) => h.seat === boundSeat)?.hand ?? 0;
  // 접힘은 '이 턴'에 한정 — 턴(pointer)이 바뀌면 키가 달라져 자동으로 펼쳐지므로 내 차례를 놓치지 않는다.
  const turnKey = `${nomination?.id ?? ""}:${nomination?.pointer ?? -1}`;
  const collapsed = collapsedKey === turnKey;
  // 내 투표 차례가 오면 소리·진동·타이틀 플래시(백그라운드 탭에서도 차례를 알림).
  useTurnAlert(myTurn, "투표 차례");

  // 모바일 뒤로가기 → 내 차례 모달을 접어 보드 확인(picker가 먼저 소비).
  useBackClose(myTurn && !collapsed && !pickerOpen, () => setCollapsedKey(turnKey));

  // 현재 투표자 클라가 자동 진행 백업(ST가 주 드라이버). 내 차례일 때만.
  useAutoAdvance(myTurn ? nomination : null, roomId);

  const cast = (hand: 0 | 1) => {
    if (inFlight.current || !nomination) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const r = await castHandAction(roomId, nomination.id, hand);
        if (r && "error" in r) setErr(r.error);
      } finally {
        inFlight.current = false;
      }
    });
  };

  const nominate = (nomineeSeat: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const r = await nominateAction(roomId, nomineeSeat);
        setPickerOpen(false);
        if (r && "error" in r) setErr(r.error);
      } finally {
        inFlight.current = false;
      }
    });
  };

  // ── 지목 없음 ──
  if (!nomination || nomination.status === "committed" || nomination.status === "cancelled") {
    if (!canNominate) {
      // 사망이면 조용히. 생존 플레이어에겐 왜 못 하는지 안내 — 지목 안 열림 vs 이미 지목함.
      if (me.status !== "alive") return null;
      const hint = nominationsOpen
        ? "오늘은 이미 지목했습니다 (하루 1회)."
        : "이야기꾼이 지목 시간을 열면 지목할 수 있습니다.";
      // 하단 가운데 subtle 알약 — 좌하단 기록·우하단 채팅 FAB를 안 가리게 코너를 비운다.
      return (
        <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100%-12rem)] -translate-x-1/2 items-center rounded-full border border-border bg-surface/95 px-3.5 py-1.5 text-xs text-muted shadow-lg backdrop-blur">
          <span className="truncate">{hint}</span>
        </div>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full border border-red-500/60 bg-surface px-5 py-2 text-sm font-semibold text-red-400 shadow-lg hover:bg-red-500/10"
        >
          지목하기
        </button>
        {pickerOpen && (
          <NomineePicker
            players={players}
            excluded={[boundSeat, ...nominatedSeats]}
            onPick={nominate}
            onClose={() => setPickerOpen(false)}
            pending={busy}
          />
        )}
      </>
    );
  }

  // ── 내 차례 — 강제 모달(접기 가능) ──
  if (nomination.status === "voting" && myTurn) {
    if (collapsed) {
      return (
        <button
          type="button"
          onClick={() => setCollapsedKey(null)}
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-gold/70 bg-surface px-4 py-2 text-sm font-semibold text-gold shadow-lg"
        >
          내 차례 — 투표하기
        </button>
      );
    }
    // 여행자 추방은 죽은 자도 유령표 없이 자유롭게 투표한다 → 유령표 소진 제한 없음.
    const deadNoGhost = !nomination.isExile && me.status === "dead" && me.ghostVoteUsed;
    return (
      <div
        data-modal
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={() => setCollapsedKey(turnKey)}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-gold/50 bg-surface p-5 text-center shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold">투표 · 내 차례</p>
          <h2 className="mb-1 text-lg font-bold leading-snug">
            “{nick(nomination.nominee)}” {nomination.isExile ? "추방" : "처형"}에 찬성합니까?
          </h2>
          <p className="mb-4 text-xs text-muted">
            {nomination.hidden ? "비공개 투표 — 집계는 이야기꾼만 봅니다" : `현재 찬성 ${upCount}표`}
            {nomination.perSeatSec > 0 && nomination.turnStartedAt && (
              <> · <Countdown startedAt={nomination.turnStartedAt} seconds={nomination.perSeatSec} /></>
            )}
          </p>
          {me.status === "dead" && (
            <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
              {nomination.isExile
                ? "여행자 추방은 죽은 뒤에도 유령표 없이 자유롭게 투표할 수 있습니다."
                : deadNoGhost
                  ? "유령표를 이미 사용해 찬성할 수 없습니다(손 내리기만)."
                  : "유령표는 게임 중 한 번만 쓸 수 있습니다."}
            </p>
          )}
          {myCharacterId === "butler" && (
            <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
              집사는 주인이 손을 들 때만 함께 찬성할 수 있습니다(주인이 안 들면 손 내리기).
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => cast(1)}
              disabled={busy || deadNoGhost}
              className={`flex-1 rounded-xl py-3 text-base font-bold disabled:opacity-40 ${
                myHand === 1 ? "bg-gold text-bg" : "border border-gold/60 text-gold hover:bg-gold/10"
              }`}
            >
              ✋ 손 들기
            </button>
            <button
              type="button"
              onClick={() => cast(0)}
              disabled={busy}
              className={`flex-1 rounded-xl py-3 text-base font-bold disabled:opacity-40 ${
                myHand === 0 ? "bg-surface-2 text-text" : "border border-border text-muted hover:bg-surface-2"
              }`}
            >
              손 내리기
            </button>
          </div>
          {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
          <button
            type="button"
            onClick={() => setCollapsedKey(turnKey)}
            className="mt-3 text-xs text-muted hover:text-text"
          >
            접기 (보드 보기) ▾
          </button>
        </div>
      </div>
    );
  }

  // ── 대기/관전/집계 — 하단 배너(보드 안 가림) ──
  let msg: string;
  if (nomination.status === "pending") {
    msg = `“${nick(nomination.nominee)}” 지목됨 · 이야기꾼이 투표를 시작하면 손을 들 수 있습니다`;
  } else if (nomination.status === "tallied") {
    msg = nomination.hidden
      ? "집계 완료(비공개) · 이야기꾼 정산 대기"
      : `집계 완료 · 찬성 ${upCount}표 · 이야기꾼 정산 대기`;
  } else {
    // voting, 남의 차례
    const prog = `${Math.min(nomination.pointer + 1, nomination.order.length)}/${nomination.order.length}`;
    msg = nomination.hidden
      ? `${nick(curSeat as number)} 투표 중 (${prog}) · 비공개`
      : `${nick(curSeat as number)} 투표 중 (${prog}) · 찬성 ${upCount}표`;
  }
  // 상단 가운데 눈에 띄는 배너 — 헤더 바로 아래(하단 FAB 회피 불필요). 펄스 점 + 골드 강조로 주목도↑.
  return (
    <div
      title={msg}
      className="fixed left-1/2 top-16 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-gold/60 bg-surface px-4 py-2 text-sm shadow-xl"
    >
      <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-gold" aria-hidden />
      <span className="shrink-0 font-bold text-gold">지목</span>
      <span className="min-w-0 truncate font-medium text-text">{msg}</span>
      {upNames.length > 0 && (
        <span className="hidden shrink-0 truncate text-muted sm:inline" title={upNames.join(", ")}>
          찬성: {upNames.join(", ")}
        </span>
      )}
    </div>
  );
}

/** 좌석당 남은 시간 카운트다운(표시 전용). */
function Countdown({ startedAt, seconds }: { startedAt: string; seconds: number }) {
  const [left, setLeft] = useState(() => remaining(startedAt, seconds));
  useEffect(() => {
    // 초기값은 useState 이니셜라이저가 처리. 인터벌 콜백의 setState만 사용(effect 본문 동기 setState 회피).
    const t = setInterval(() => setLeft(remaining(startedAt, seconds)), 250);
    return () => clearInterval(t);
  }, [startedAt, seconds]);
  return <span className={left <= 3 ? "text-red-400" : ""}>{left}초</span>;
}

function remaining(startedAt: string, seconds: number): number {
  return Math.max(0, Math.ceil(seconds - (Date.now() - Date.parse(startedAt)) / 1000));
}

/** 지목 대상 선택 — 자기 자신·이미 지목된 좌석 제외. */
function NomineePicker({
  players,
  excluded,
  onPick,
  onClose,
  pending,
}: {
  players: SeatLite[];
  excluded: number[];
  onPick: (seat: number) => void;
  onClose: () => void;
  pending: boolean;
}) {
  useBackClose(true, onClose);
  return (
    <div
      data-modal
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">누구를 지목하시겠습니까?</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:text-text">✕</button>
        </div>
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
          {players.map((p) => {
            const off = excluded.includes(p.seat);
            return (
              <button
                key={p.seat}
                type="button"
                disabled={off || pending}
                onClick={() => onPick(p.seat)}
                className={`truncate rounded-lg border px-3 py-2 text-left text-sm ${
                  off
                    ? "cursor-not-allowed border-border bg-bg opacity-40"
                    : "border-border bg-bg hover:border-red-500/60"
                } ${p.status === "dead" ? "grayscale" : ""}`}
                title={off ? "지목할 수 없음" : p.nickname}
              >
                {p.nickname}
                {p.status === "dead" && <span className="ml-1 text-xs text-muted">(사망)</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
