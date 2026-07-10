"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TEAMS } from "@/lib/constants";
import type { Character, Game } from "@/lib/types";
import { CharacterIcon } from "./CharacterIcon";
import { AbilityModal } from "./AbilityModal";
import { RolePickerModal } from "./RolePickerModal";
import { useGameStream } from "./useGameStream";
import { useBackClose } from "./useBackClose";
import { ChatWidget } from "./ChatWidget";
import { NightRequestPanel, type NightRequestView } from "./NightRequestPanel";
import { NightHistoryList } from "./NightHistoryList";
import { DayVotePanel, type NominationView } from "./DayVotePanel";
import { DayTimers } from "./DayTimers";
import { Modal } from "./Modal";
import { getMyRequestHistoryAction } from "@/app/rooms/actions";
import {
  setGeneralMemoAction,
  setGuessAction,
  setSeatNoteAction,
} from "@/app/rooms/actions";

type SeatGuess = { guess: string; note: string };

/**
 * 온라인 플레이어 메인 뷰 — 이야기꾼과 같은 좌석 배치를 보되 모든 토큰이 "?"(본인 좌석만 진짜 직업).
 * 좌석을 눌러 직업을 추측하고 메모를 남긴다(개인 기록, 다른 사람에게 안 보임).
 * game은 서버에서 redact돼 본인 외 좌석의 직업/비밀이 없다.
 */
export function PlayerGame({
  game,
  sheetChars,
  boundSeat,
  gameId,
  roomId,
  meId,
  members,
  memberColors = {},
  seatColors = {},
  initialNotes,
  request,
  nomination,
  canNominate,
  nominatedSeats,
}: {
  game: Game;
  sheetChars: Character[];
  boundSeat: number;
  gameId: string;
  roomId: string;
  meId: number;
  members: { userId: number; nickname: string }[];
  /** userId → 색 id(채팅 닉네임 색). */
  memberColors?: Record<number, string>;
  /** seat → hex(보드 좌석 라벨 색). */
  seatColors?: Record<number, string>;
  initialNotes: { seats: Record<number, SeatGuess>; memo: string };
  request: NightRequestView | null;
  nomination: NominationView | null;
  canNominate: boolean;
  nominatedSeats: number[];
}) {
  const router = useRouter();
  const charMap = Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>;

  // 참여한 방의 스크립트 직업 목록 — 팀별 그룹(전체 공개 스크립트, 인플레이 여부는 표시하지 않음).
  const scriptGroups = useMemo(() => {
    const byTeam = new Map<string, Character[]>();
    for (const c of sheetChars) {
      const list = byTeam.get(c.team) ?? [];
      list.push(c);
      byTeam.set(c.team, list);
    }
    return TEAMS.filter((t) => byTeam.has(t.id)).map((t) => ({ team: t, chars: byTeam.get(t.id)! }));
  }, [sheetChars]);

  // 추측/메모는 로컬에서 즉시 반영 + 서버 액션으로 영속(사적이라 SSE 브로드캐스트 없음).
  const [seats, setSeats] = useState<Record<number, SeatGuess>>(initialNotes.seats);
  const [memo, setMemo] = useState(initialNotes.memo);
  const [panelSeat, setPanelSeat] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<NightRequestView[]>([]);
  const [modalChar, setModalChar] = useState<Character | null>(null);
  const [, startTransition] = useTransition();

  // 기록(받은 정보·내 응답) — 열 때 가져온다.
  useEffect(() => {
    if (!historyOpen) return;
    getMyRequestHistoryAction(roomId)
      .then((h) => setHistory(h as NightRequestView[]))
      .catch(() => {});
  }, [historyOpen, roomId]);

  // 이야기꾼이 게임을 바꾸면(사망·이동·밤 행동 요청 등) SSE로 보드를 즉시 갱신.
  useGameStream(gameId, () => {
    if (document.visibilityState === "visible") router.refresh();
  });

  // 백그라운드였다 돌아오면(모바일) 놓친 변경/요청을 다시 가져온다(SSE는 hidden일 때 refresh 건너뜀).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [router]);

  const me = game.players.find((p) => p.seat === boundSeat);
  const myCharId = me ? game.disguises?.[boundSeat] ?? me.characterId : "";
  const myChar = charMap[myCharId];
  const disguised = !!game.disguises?.[boundSeat] && game.disguises[boundSeat] !== me?.characterId;

  const guessOf = (seat: number): SeatGuess => seats[seat] ?? { guess: "", note: "" };

  const saveGuess = (seat: number, guess: string) => {
    setSeats((prev) => ({ ...prev, [seat]: { ...(prev[seat] ?? { guess: "", note: "" }), guess } }));
    startTransition(async () => {
      await setGuessAction(roomId, seat, guess);
    });
  };
  // 메모는 controlled 로컬 상태로 두고(타이핑 유실 방지), 영속은 패널 닫힐 때/blur에 한 번.
  const updateNoteLocal = (seat: number, note: string) =>
    setSeats((prev) => ({ ...prev, [seat]: { ...(prev[seat] ?? { guess: "", note: "" }), note } }));
  const persistSeatNote = (seat: number) => {
    startTransition(async () => {
      await setSeatNoteAction(roomId, seat, guessOf(seat).note);
    });
  };
  const saveMemo = (note: string) => {
    startTransition(async () => {
      await setGeneralMemoAction(roomId, note);
    });
  };

  // 패널 닫기 — 닫기 전에 메모를 영속(모바일 뒤로가기로 닫혀도 유실 안 되게).
  const closePanel = () => {
    if (panelSeat != null) persistSeatNote(panelSeat);
    setPanelSeat(null);
  };

  // 모바일 뒤로가기 → 패널만 닫기(페이지 이탈 X). picker가 열려 있으면 picker가 먼저 처리.
  useBackClose(panelSeat != null, closePanel);
  // Escape → 패널 닫기(picker 열려 있을 땐 picker가 소비).
  useEffect(() => {
    if (panelSeat == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pickerOpen) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closePanel은 매 렌더 새로 만들어지지만 effect는 panelSeat/pickerOpen 변화에만 재구독한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSeat, pickerOpen]);

  // 토큰 크기는 인원 수에 맞춰 줄여 겹침을 줄인다. 좌표는 안쪽으로 모아 가장자리 라벨 클리핑 방지.
  const tokenPx = game.players.length > 11 ? 38 : game.players.length > 8 ? 44 : 52;
  const INSET = 0.1;
  const posPct = (v: number) => `${(INSET + v * (1 - 2 * INSET)) * 100}%`;

  return (
    <div className="mx-auto max-w-xl pb-16 lg:max-w-4xl">
      {/* 낮 타이머(밀담·공개토론) — ST가 시작하면 헤더 아래에 카운트다운. 진행 중일 때만. */}
      <DayTimers timers={game.phaseTimers} />

      {/* 내 직업 배너 */}
      {myChar && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-gold/40 bg-surface p-3">
          <CharacterIcon character={myChar} size={48} />
          <div className="min-w-0">
            <p className="text-xs text-muted">
              내 직업{disguised ? " (믿는 직업)" : ""} · {game.day}일차 {game.phase === "night" ? "밤" : "낮"}
            </p>
            <p className="font-bold">{myChar.name.ko}</p>
            <p className="line-clamp-2 text-xs text-muted">{myChar.ability.ko}</p>
          </div>
        </div>
      )}

      <p className="mb-2 text-xs text-muted">
        좌석을 눌러 직업을 추측하고 메모하세요. 기록은 나만 볼 수 있습니다.
      </p>

      {/* 데스크탑: 보드(좌) + 메모 사이드바(우). 모바일: 세로 스택. */}
      <div className="lg:flex lg:gap-6">
        {/* 마스킹 보드 — 이야기꾼과 동일 좌석 배치, 본인 외 토큰은 "?" */}
        <div
          className="relative mx-auto aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface lg:mx-0 lg:min-w-0 lg:flex-1 lg:self-start"
          style={{ backgroundImage: "radial-gradient(circle, rgba(212,162,58,0.06) 0%, transparent 70%)" }}
        >
        {game.players.map((p) => {
          const isMe = p.seat === boundSeat;
          const dead = p.status === "dead";
          const g = guessOf(p.seat);
          const guessCh = g.guess ? charMap[g.guess] : undefined;
          const deathGlyph = p.deathCause === "execution" ? "☠️" : p.deathCause === "night" ? "🌙" : "✕";
          return (
            <div
              key={p.seat}
              className="absolute flex flex-col items-center gap-0.5"
              style={{ left: posPct(p.x), top: posPct(p.y), transform: "translate(-50%, -50%)" }}
            >
              {/* 탭 타깃은 토큰만(라벨은 아래 pointer-events-none) — 겹친 이웃 좌석 오탭 방지 */}
              <button
                type="button"
                disabled={isMe}
                onClick={() => setPanelSeat(p.seat)}
                className="relative block disabled:cursor-default"
                style={{ width: tokenPx, height: tokenPx }}
                title={isMe ? "내 자리" : `${p.nickname} — 추측·메모`}
              >
                <div
                  className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 bg-bg ${
                    dead ? "opacity-40 grayscale" : ""
                  } ${isMe ? "border-gold ring-2 ring-gold ring-offset-1 ring-offset-surface" : "border-border"}`}
                >
                  {isMe && myChar ? (
                    <CharacterIcon character={myChar} size={tokenPx - 6} />
                  ) : guessCh ? (
                    <CharacterIcon character={guessCh} size={tokenPx - 6} />
                  ) : (
                    <span className="font-bold text-muted" style={{ fontSize: tokenPx * 0.42 }}>?</span>
                  )}
                  {dead && (
                    <span className="absolute inset-0 flex items-center justify-center text-red-500" style={{ fontSize: tokenPx * 0.45 }}>
                      {deathGlyph}
                    </span>
                  )}
                </div>
                {/* 추측(미확정) 표시 — 점선 링 */}
                {!isMe && guessCh && (
                  <span className="pointer-events-none absolute -inset-0.5 rounded-full border border-dashed border-gold/70" aria-hidden />
                )}
                {/* 메모 표시 */}
                {!isMe && g.note && (
                  <span className="pointer-events-none absolute -left-1 -top-1 rounded-full bg-surface-2 px-1 text-[11px]">📝</span>
                )}
              </button>
              <span
                className={`pointer-events-none max-w-[4.2rem] truncate text-[10px] ${isMe ? "font-semibold text-gold" : "font-medium text-text"}`}
                style={isMe ? undefined : { color: seatColors[p.seat] }}
              >
                {p.nickname}
                {isMe ? " (나)" : ""}
              </span>
            </div>
          );
        })}
      </div>

        {/* 우측 사이드바 — 스크립트 직업 목록 + 자유 메모. 모바일은 보드 아래로 스택. */}
        <aside className="mt-4 flex flex-col gap-4 lg:mt-0 lg:w-80 lg:shrink-0">
          {/* 참여한 방의 스크립트 직업 — 팀별, 클릭하면 상세 모달(전체 공개, 인플레이 표시 안 함). */}
          <section className="flex shrink-0 flex-col">
            <label className="mb-1 block text-xs font-semibold text-muted">
              스크립트 직업 <span className="font-normal text-muted/60">· {sheetChars.length}</span>
            </label>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-surface p-2 lg:max-h-80">
              {scriptGroups.map(({ team, chars }) => (
                <div key={team.id} className="mb-2 last:mb-0">
                  <p className="mb-1 px-1 text-[11px] font-semibold" style={{ color: team.color }}>
                    {team.label.ko} <span className="text-muted/70">· {chars.length}</span>
                  </p>
                  <div className="space-y-0.5">
                    {chars.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setModalChar(c)}
                        title={`${c.name.ko} — 상세 보기`}
                        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
                      >
                        <CharacterIcon character={c} size={24} />
                        <span className="truncate text-xs font-medium">{c.name.ko}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 자유 메모 — 많이 쓸 수 있게 크게. */}
          <section className="flex min-h-0 flex-1 flex-col">
            <label className="mb-1 block text-xs font-semibold text-muted">
              메모 <span className="font-normal text-muted/60">· 나만 봄</span>
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={() => saveMemo(memo)}
              placeholder="자유롭게 기록하세요"
              className="min-h-[8rem] w-full flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold/60"
            />
          </section>
        </aside>
      </div>

      {/* 좌석 추측·메모 패널 */}
      {panelSeat != null && (() => {
        const target = game.players.find((p) => p.seat === panelSeat);
        if (!target) return null;
        const g = guessOf(panelSeat);
        const guessCh = g.guess ? charMap[g.guess] : undefined;
        return (
          <div
            data-modal
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            onClick={closePanel}
          >
            <div
              className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-4 sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">{target.nickname}</h2>
                <button type="button" onClick={closePanel} className="rounded p-1 text-muted hover:text-text">✕</button>
              </div>

              <p className="mb-1 text-xs text-muted">추측 직업</p>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="mb-3 flex w-full items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left text-sm hover:border-gold/60"
              >
                {guessCh ? (
                  <>
                    <CharacterIcon character={guessCh} size={28} />
                    <span className="font-medium">{guessCh.name.ko}</span>
                    <span className="ml-auto text-xs text-muted">바꾸기</span>
                  </>
                ) : (
                  <span className="text-muted">직업 선택…</span>
                )}
              </button>

              <p className="mb-1 text-xs text-muted">메모</p>
              <textarea
                value={g.note}
                onChange={(e) => updateNoteLocal(panelSeat, e.target.value)}
                onBlur={() => persistSeatNote(panelSeat)}
                rows={3}
                maxLength={500}
                placeholder="이 사람에 대한 메모"
                className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-gold/60"
              />
            </div>

            <RolePickerModal
              open={pickerOpen}
              title={`${target.nickname} — 직업 추측`}
              candidates={sheetChars}
              selected={g.guess}
              onPick={(id) => saveGuess(panelSeat, id)}
              onClose={() => setPickerOpen(false)}
              clearLabel="추측 지움"
            />
          </div>
        );
      })()}

      <ChatWidget roomId={roomId} meId={meId} members={members} memberColors={memberColors} locked={game.phase === "night"} />

      {/* 받은 정보·내 응답 기록 — 진행 요청과 분리해 다시 볼 수 있게. */}
      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex h-12 items-center gap-1.5 rounded-full border border-border bg-surface px-4 shadow-lg hover:border-gold/60"
        title="받은 정보 기록"
      >
        <span className="text-sm font-medium">기록</span>
      </button>
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        panelClassName="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">밤 행동 기록</h2>
          <button type="button" onClick={() => setHistoryOpen(false)} className="rounded p-1 text-muted hover:text-text">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NightHistoryList requests={history} charMap={charMap} />
        </div>
      </Modal>

      {request && request.status !== "done" && request.status !== "cancelled" && (
        <NightRequestPanel
          key={request.id}
          request={request}
          roomId={roomId}
          charMap={charMap}
          players={game.players.map((p) => ({ seat: p.seat, nickname: p.nickname, status: p.status }))}
        />
      )}

      {/* 낮 지목·투표(시계바늘 순차) — 낮에만. 내 차례엔 강제 모달, 그 외엔 하단 배너. */}
      {game.phase === "day" && me && (
        <DayVotePanel
          nomination={nomination}
          roomId={roomId}
          boundSeat={boundSeat}
          players={game.players.map((p) => ({ seat: p.seat, nickname: p.nickname, status: p.status }))}
          me={{ status: me.status, ghostVoteUsed: me.ghostVoteUsed }}
          canNominate={canNominate}
          nominatedSeats={nominatedSeats}
        />
      )}

      {/* 스크립트 직업 상세 — 목록에서 클릭 시. ST 보드와 동일한 능력 모달 재사용. */}
      {modalChar && <AbilityModal character={modalChar} onClose={() => setModalChar(null)} />}
    </div>
  );
}
