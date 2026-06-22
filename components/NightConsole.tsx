"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Character, Game } from "@/lib/types";
import { CharacterIcon } from "./CharacterIcon";
import { RolePickerModal } from "./RolePickerModal";
import {
  cancelNightRequestAction,
  createNightRequestAction,
  deliverNightRequestAction,
  listNightRequestsAction,
} from "@/app/rooms/actions";
import { useGameStream } from "./useGameStream";
import type { InfoPayload, NightRequestView } from "./NightRequestPanel";

/**
 * 이야기꾼 밤 행동 콘솔(플로팅, 온라인 보드) — 좌석에 요청을 보내고 플레이어 응답을 받아 최종 정보를 전달.
 * 게임 SSE로 플레이어 응답을 즉시 받아 갱신한다.
 */
export function NightConsole({
  game,
  sheetChars,
  roomId,
}: {
  game: Game;
  sheetChars: Character[];
  roomId: string;
}) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<NightRequestView[]>([]);

  const load = () => {
    listNightRequestsAction(roomId)
      .then((r) => setRequests(r as NightRequestView[]))
      .catch(() => {});
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  useGameStream(game.id, load);

  const respondedCount = requests.filter((r) => r.status === "responded").length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex h-12 items-center gap-1.5 rounded-full border border-gold/50 bg-surface px-4 shadow-lg hover:border-gold"
        title="밤 행동 요청"
      >
        <span className="text-sm font-semibold">밤 행동</span>
        {respondedCount > 0 && (
          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-bg">
            {respondedCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <ConsolePanel
      game={game}
      sheetChars={sheetChars}
      roomId={roomId}
      requests={requests}
      reload={load}
      onClose={() => setOpen(false)}
    />
  );
}

function ConsolePanel({
  game,
  sheetChars,
  roomId,
  requests,
  reload,
  onClose,
}: {
  game: Game;
  sheetChars: Character[];
  roomId: string;
  requests: NightRequestView[];
  reload: () => void;
  onClose: () => void;
}) {
  const charMap = useMemo(
    () => Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>,
    [sheetChars],
  );
  const alive = game.players.filter((p) => p.status === "alive");
  const nameOf = (seat: number) => game.players.find((p) => p.seat === seat)?.nickname ?? `좌석 ${seat + 1}`;
  const roleOf = (seat: number) => charMap[game.players.find((p) => p.seat === seat)?.characterId ?? ""];

  return (
    <div className="fixed bottom-0 left-0 z-40 flex h-[78vh] w-full flex-col border border-border bg-surface shadow-xl sm:bottom-4 sm:left-4 sm:h-[36rem] sm:w-96 sm:rounded-2xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">밤 행동 콘솔</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:text-text">✕</button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* 활성 요청 */}
        {requests.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted">진행 중 요청</h3>
            <ul className="space-y-2">
              {requests.map((r) => (
                <RequestRow
                  key={r.id}
                  req={r}
                  roomId={roomId}
                  nameOf={nameOf}
                  charMap={charMap}
                  players={game.players.map((p) => ({ seat: p.seat, nickname: p.nickname, status: p.status }))}
                  reload={reload}
                />
              ))}
            </ul>
          </section>
        )}

        {/* 새 요청 */}
        <NewRequest
          alive={alive.map((p) => ({ seat: p.seat, nickname: p.nickname, role: roleOf(p.seat)?.name.ko }))}
          players={game.players.map((p) => ({ seat: p.seat, nickname: p.nickname, status: p.status }))}
          candidates={sheetChars}
          charMap={charMap}
          roomId={roomId}
          reload={reload}
        />
      </div>
    </div>
  );
}

type SeatLite = { seat: number; nickname: string; status: "alive" | "dead" };

function RequestRow({
  req,
  roomId,
  nameOf,
  charMap,
  players,
  reload,
}: {
  req: NightRequestView;
  roomId: string;
  nameOf: (seat: number) => string;
  charMap: Record<string, Character>;
  players: SeatLite[];
  reload: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const cancel = () =>
    startTransition(async () => {
      await cancelNightRequestAction(roomId, req.id);
      reload();
    });

  const statusLabel =
    req.status === "awaiting" ? "플레이어 응답 대기" : req.status === "responded" ? "응답 도착" : "확인 대기";

  return (
    <li className="rounded-lg border border-border bg-bg p-2.5 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">{nameOf(req.seat)}</span>
        <span className={`text-xs ${req.status === "responded" ? "text-gold" : "text-muted"}`}>{statusLabel}</span>
      </div>
      {req.prompt && <p className="mb-1 text-xs text-muted">“{req.prompt}”</p>}

      {/* 플레이어 응답 표시 */}
      {req.status === "responded" && (
        <div className="mb-2 rounded bg-surface px-2 py-1.5 text-xs">
          {req.playerChoice ? (
            <span>선택 직업: <b>{charMap[req.playerChoice]?.name.ko ?? req.playerChoice}</b></span>
          ) : req.playerTargets.length > 0 ? (
            <span>선택 좌석: <b>{req.playerTargets.map(nameOf).join(", ")}</b></span>
          ) : (
            <span className="text-muted">(빈 응답)</span>
          )}
        </div>
      )}

      {/* responded → 정보 작성·전달 */}
      {req.status === "responded" && (
        <InfoComposer
          players={players}
          candidates={Object.values(charMap)}
          charMap={charMap}
          sendLabel="정보 전달"
          onSend={(info) =>
            startTransition(async () => {
              await deliverNightRequestAction(roomId, req.id, info);
              reload();
            })
          }
        />
      )}

      {req.status !== "responded" && (
        <button type="button" onClick={cancel} disabled={pending} className="text-xs text-muted hover:text-red-400 disabled:opacity-40">
          요청 취소
        </button>
      )}
    </li>
  );
}

function NewRequest({
  alive,
  players,
  candidates,
  charMap,
  roomId,
  reload,
}: {
  alive: { seat: number; nickname: string; role?: string }[];
  players: SeatLite[];
  candidates: Character[];
  charMap: Record<string, Character>;
  roomId: string;
  reload: () => void;
}) {
  const [seat, setSeat] = useState<number | null>(null);
  const [tab, setTab] = useState<"info" | "action">("info");
  const [actionKind, setActionKind] = useState<"pick-players" | "pick-character">("pick-players");
  const [prompt, setPrompt] = useState("");
  const [maxTargets, setMaxTargets] = useState(1);
  const [pending, startTransition] = useTransition();

  const sendAction = () => {
    if (seat == null) return;
    startTransition(async () => {
      await createNightRequestAction(roomId, {
        seat,
        kind: actionKind,
        prompt,
        maxTargets: actionKind === "pick-players" ? maxTargets : 1,
      });
      setPrompt("");
      reload();
    });
  };
  const sendInfo = (info: InfoPayload) => {
    if (seat == null) return;
    startTransition(async () => {
      await createNightRequestAction(roomId, { seat, kind: "info", info });
      reload();
    });
  };

  return (
    <section className="rounded-lg border border-gold/40 bg-bg p-3">
      <h3 className="mb-2 text-xs font-semibold">새 요청 보내기</h3>

      <label className="mb-2 block text-xs text-muted">
        대상 좌석
        <select
          value={seat == null ? "" : String(seat)}
          onChange={(e) => setSeat(e.target.value === "" ? null : Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text outline-none focus:border-gold/60"
        >
          <option value="">— 선택 —</option>
          {alive.map((p) => (
            <option key={p.seat} value={p.seat}>
              {p.nickname}
              {p.role ? ` · ${p.role}` : ""}
            </option>
          ))}
        </select>
      </label>

      {seat != null && (
        <>
          <div className="mb-2 flex gap-1">
            <TabBtn on={tab === "info"} onClick={() => setTab("info")}>정보 보내기</TabBtn>
            <TabBtn on={tab === "action"} onClick={() => setTab("action")}>행동 요청</TabBtn>
          </div>

          {tab === "info" ? (
            <InfoComposer players={players} candidates={candidates} charMap={charMap} sendLabel="정보 보내기" onSend={sendInfo} />
          ) : (
            <div className="space-y-2">
              <div className="flex gap-1">
                <TabBtn on={actionKind === "pick-players"} onClick={() => setActionKind("pick-players")}>좌석 선택</TabBtn>
                <TabBtn on={actionKind === "pick-character"} onClick={() => setActionKind("pick-character")}>직업 선택</TabBtn>
              </div>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="안내 문구 (예: 두 명을 선택하세요)"
                className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-gold/60"
              />
              {actionKind === "pick-players" && (
                <label className="block text-xs text-muted">
                  선택 수
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={maxTargets}
                    onChange={(e) => setMaxTargets(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
                    className="ml-2 w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text outline-none"
                  />
                </label>
              )}
              <button
                type="button"
                onClick={sendAction}
                disabled={pending}
                className="w-full rounded-lg bg-gold py-2 text-sm font-semibold text-bg disabled:opacity-40"
              >
                요청 보내기
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TabBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs ${on ? "border-gold bg-gold/15 text-text" : "border-border text-muted hover:text-text"}`}
    >
      {children}
    </button>
  );
}

/** 보여줄 정보 작성기 — heading/subheading + 직업 토큰 + 이름 토큰(좌석). */
function InfoComposer({
  players,
  candidates,
  charMap,
  onSend,
  sendLabel,
}: {
  players: SeatLite[];
  candidates: Character[];
  charMap: Record<string, Character>;
  onSend: (info: InfoPayload) => void;
  sendLabel: string;
}) {
  const [heading, setHeading] = useState("");
  const [subheading, setSubheading] = useState("");
  const [roleTokens, setRoleTokens] = useState<string[]>([]);
  const [nameSeats, setNameSeats] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggleName = (s: number) =>
    setNameSeats((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const send = () => {
    if (!heading.trim()) return;
    onSend({
      heading: heading.trim(),
      subheading: subheading.trim() || undefined,
      roleTokens,
      nameTokens: nameSeats.map((s) => players.find((p) => p.seat === s)?.nickname ?? "").filter(Boolean),
    });
    setHeading("");
    setSubheading("");
    setRoleTokens([]);
    setNameSeats([]);
  };

  return (
    <div className="mt-2 space-y-2">
      <input
        value={heading}
        onChange={(e) => setHeading(e.target.value)}
        placeholder="큰 메시지 (예: 이 중 한 명은 세탁부입니다)"
        className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-gold/60"
      />
      <input
        value={subheading}
        onChange={(e) => setSubheading(e.target.value)}
        placeholder="부가 설명 (선택)"
        className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold/60"
      />

      {/* 직업 토큰 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {roleTokens.map((id, i) => (
          <button
            key={`${id}-${i}`}
            type="button"
            onClick={() => setRoleTokens((prev) => prev.filter((_, j) => j !== i))}
            className="flex items-center gap-1 rounded-full border border-border bg-bg px-1.5 py-0.5 text-xs"
            title="제거"
          >
            {charMap[id] && <CharacterIcon character={charMap[id]} size={18} />}
            {charMap[id]?.name.ko ?? id} ✕
          </button>
        ))}
        <button type="button" onClick={() => setPickerOpen(true)} className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted hover:text-text">
          + 직업
        </button>
      </div>

      {/* 이름 토큰(좌석) */}
      <div className="flex flex-wrap gap-1">
        {players.map((p) => (
          <button
            key={p.seat}
            type="button"
            onClick={() => toggleName(p.seat)}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${nameSeats.includes(p.seat) ? "border-gold bg-gold/15" : "border-border text-muted"}`}
          >
            {p.nickname}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={send}
        disabled={!heading.trim()}
        className="w-full rounded-lg bg-gold py-2 text-sm font-semibold text-bg disabled:opacity-40"
      >
        {sendLabel}
      </button>

      <RolePickerModal
        open={pickerOpen}
        title="보여줄 직업 추가"
        candidates={candidates}
        selected=""
        onPick={(id) => {
          if (id) setRoleTokens((prev) => [...prev, id]);
        }}
        onClose={() => setPickerOpen(false)}
        clearLabel="취소"
      />
    </div>
  );
}
