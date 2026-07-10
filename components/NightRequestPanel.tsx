"use client";

import { useState, useTransition } from "react";
import type { Character } from "@/lib/types";
import type { ShowcasePayload } from "@/lib/showcase";
import { CharacterIcon } from "./CharacterIcon";
import { RolePickerModal } from "./RolePickerModal";
import { ShowcasePayloadView } from "./ShowcasePayloadView";
import { useBackClose } from "./useBackClose";
import { useTurnAlert } from "./useTurnAlert";
import {
  acknowledgeNightRequestAction,
  respondNightRequestAction,
} from "@/app/rooms/actions";

// lib/night-requests의 타입과 동일 구조(클라가 서버 모듈 import 안 하도록 로컬 정의).
export type NightRequestView = {
  id: string;
  seat: number;
  kind: "info" | "pick-players" | "pick-character" | "pick-player-character";
  prompt: string;
  maxTargets: number;
  status: "awaiting" | "responded" | "delivered" | "done" | "cancelled";
  playerTargets: number[];
  playerChoice: string;
  info: ShowcasePayload | null;
  createdAt: string;
};

type SeatLite = { seat: number; nickname: string; status: "alive" | "dead" };

/**
 * 플레이어 화면의 밤 행동 요청 패널(모달). 이야기꾼이 보낸 요청을 상태별로 렌더한다.
 * - awaiting + pick-players  : 좌석 N개 선택 → 응답
 * - awaiting + pick-character: 직업 1개 선택 → 응답
 * - responded                : 이야기꾼 대기
 * - delivered                : 전달된 정보 표시 → 확인
 */
export function NightRequestPanel({
  request,
  roomId,
  charMap,
  players,
}: {
  request: NightRequestView;
  roomId: string;
  charMap: Record<string, Character>;
  players: SeatLite[];
}) {
  const [targets, setTargets] = useState<number[]>([]);
  const [chosen, setChosen] = useState(request.playerChoice ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pending, startTransition] = useTransition();

  // 모바일 뒤로가기 → 패널을 접어 보드를 볼 수 있게(페이지 이탈 방지). picker가 먼저 소비.
  useBackClose(!collapsed && !pickerOpen, () => setCollapsed(true));

  // 내 응답이 필요한 요청(선택 대기·정보 확인 대기)이 도착하면 소리·진동·타이틀 플래시.
  useTurnAlert(request.status === "awaiting" || request.status === "delivered", "밤 행동");

  const candidates = Object.values(charMap);

  // 접힘 — 작은 FAB로 다시 열 수 있게. (요청 id가 바뀌면 PlayerGame의 key로 새로 마운트되어 펼쳐짐.)
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-gold/60 bg-surface px-4 py-2 text-sm font-semibold text-gold shadow-lg"
      >
        이야기꾼 요청 보기
      </button>
    );
  }

  const respondNow = (t: number[], c: string) =>
    startTransition(async () => {
      await respondNightRequestAction(roomId, request.id, t, c);
    });
  const ack = () =>
    startTransition(async () => {
      await acknowledgeNightRequestAction(roomId, request.id);
    });

  const toggleSeat = (s: number) =>
    setTargets((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      if (prev.length >= request.maxTargets) {
        // 상한 도달 시 가장 오래된 선택을 밀어낸다(라디오처럼 maxTargets=1이면 교체).
        return [...prev.slice(1), s];
      }
      return [...prev, s];
    });

  const Shell = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => (
    <div
      data-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => setCollapsed(true)}
    >
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-2xl border border-gold/50 bg-surface p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">이야기꾼 요청</p>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded px-2 py-0.5 text-xs text-muted hover:text-text"
            title="접기 (보드 보기)"
          >
            접기 ▾
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  // 전달된 보여주기 표시 — LAN show 페이지와 같은 ShowcasePayloadView로 1:1 렌더.
  // info가 비어 있어도 확인 버튼으로 빠져나갈 수 있게(막힌 모달 방지).
  if (request.status === "delivered") {
    // 마도서(그리모어)는 전체 보드라 모달을 넓게.
    const wide = request.info?.kind === "grimoire";
    return (
      <Shell wide={wide}>
        {request.info ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <ShowcasePayloadView payload={request.info} getChar={(id) => charMap[id]} />
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">정보가 도착했습니다.</p>
        )}
        <button
          type="button"
          onClick={ack}
          disabled={pending}
          className="mt-4 w-full rounded-lg bg-gold py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
        >
          확인했습니다
        </button>
      </Shell>
    );
  }

  // 응답 완료 — 이야기꾼 대기
  if (request.status === "responded") {
    return (
      <Shell>
        <p className="py-6 text-center text-sm text-muted">응답을 보냈습니다. 이야기꾼이 확인하는 중…</p>
      </Shell>
    );
  }

  // awaiting — 직업 선택. 즉시 제출하지 않고 고른 뒤 '제출'로 확정(오탭 방지).
  if (request.kind === "pick-character") {
    const chosenChar = chosen ? charMap[chosen] : undefined;
    return (
      <Shell>
        <h2 className="mb-1 text-base font-semibold">{request.prompt || "직업을 선택하세요"}</h2>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="my-3 flex w-full items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left text-sm hover:border-gold/60"
        >
          {chosenChar ? (
            <>
              <CharacterIcon character={chosenChar} size={28} />
              <span className="font-medium">{chosenChar.name.ko}</span>
              <span className="ml-auto text-xs text-muted">바꾸기</span>
            </>
          ) : (
            <span className="text-muted">직업 선택…</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => respondNow([], chosen)}
          disabled={pending || !chosen}
          className="w-full rounded-lg bg-gold py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
        >
          제출
        </button>
        <RolePickerModal
          open={pickerOpen}
          title={request.prompt || "직업 선택"}
          candidates={candidates}
          selected={chosen}
          onPick={(id) => setChosen(id)}
          onClose={() => setPickerOpen(false)}
          clearLabel="선택 안 함"
        />
      </Shell>
    );
  }

  // awaiting — 플레이어 + 직업 둘 다 선택(도박꾼 등)
  if (request.kind === "pick-player-character") {
    const chosenChar = chosen ? charMap[chosen] : undefined;
    return (
      <Shell>
        <h2 className="mb-2 text-base font-semibold">{request.prompt || "플레이어와 직업을 선택하세요"}</h2>
        <p className="mb-1 text-xs text-muted">플레이어{targets[0] != null ? " ✓" : ""}</p>
        <div className="mb-3 grid max-h-40 grid-cols-2 gap-2 overflow-y-auto">
          {players.map((p) => {
            const on = targets.includes(p.seat);
            return (
              <button
                key={p.seat}
                type="button"
                onClick={() => toggleSeat(p.seat)}
                className={`truncate rounded-lg border px-3 py-2 text-left text-sm ${
                  on ? "border-gold bg-gold/15" : "border-border bg-bg hover:border-gold/50"
                } ${p.status === "dead" ? "opacity-50" : ""}`}
              >
                {p.nickname}
                {p.status === "dead" && <span className="ml-1 text-xs text-muted">(사망)</span>}
              </button>
            );
          })}
        </div>
        <p className="mb-1 text-xs text-muted">직업{chosen ? " ✓" : ""}</p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mb-3 flex w-full items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left text-sm hover:border-gold/60"
        >
          {chosenChar ? (
            <>
              <CharacterIcon character={chosenChar} size={28} />
              <span className="font-medium">{chosenChar.name.ko}</span>
              <span className="ml-auto text-xs text-muted">바꾸기</span>
            </>
          ) : (
            <span className="text-muted">직업 선택…</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => respondNow(targets, chosen)}
          disabled={pending || targets.length === 0 || !chosen}
          className="w-full rounded-lg bg-gold py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
        >
          제출
        </button>
        <RolePickerModal
          open={pickerOpen}
          title="직업 선택"
          candidates={candidates}
          selected={chosen}
          onPick={(id) => setChosen(id)}
          onClose={() => setPickerOpen(false)}
          clearLabel="선택 안 함"
        />
      </Shell>
    );
  }

  // awaiting — 좌석 선택(pick-players)
  return (
    <Shell>
      <h2 className="mb-1 text-base font-semibold">
        {request.prompt || `좌석 ${request.maxTargets}개를 선택하세요`}
      </h2>
      <p className="mb-3 text-xs text-muted">
        선택 {targets.length}/{request.maxTargets}
      </p>
      <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto">
        {players.map((p) => {
          const on = targets.includes(p.seat);
          return (
            <button
              key={p.seat}
              type="button"
              onClick={() => toggleSeat(p.seat)}
              className={`truncate rounded-lg border px-3 py-2 text-left text-sm ${
                on ? "border-gold bg-gold/15" : "border-border bg-bg hover:border-gold/50"
              } ${p.status === "dead" ? "opacity-50" : ""}`}
            >
              {p.nickname}
              {p.status === "dead" && <span className="ml-1 text-xs text-muted">(사망)</span>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => respondNow(targets, "")}
        disabled={pending || targets.length === 0}
        className="mt-4 w-full rounded-lg bg-gold py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
      >
        제출
      </button>
    </Shell>
  );
}
