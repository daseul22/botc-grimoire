"use client";

import { useState } from "react";
import { MARKER_MAP } from "@/lib/markers";
import { formatResult, INFO_KINDS, infoTargetWarn, markerForAction, playerChoosesTargets, showcaseVariants, type ActionSpec } from "@/lib/night-actions";
import type { Character, GamePlayer, NightActionRecord, VoteRecord } from "@/lib/types";
import { ActionFields } from "./ActionFields";
import { RequestStatusBadge } from "./RequestStatusBadge";
import type { NightRequestView } from "./NightRequestPanel";

const short = (s: string) => (s.length > 7 ? s.slice(0, 6) + "…" : s);

/**
 * 온라인 밤 컨텍스트 — 있으면 '보여주기/직업 목록'이 LAN 링크(새 창 풀스크린) 대신 플레이어 폰으로 push된다.
 * requestBySeat: 좌석별 활성 요청(전송/응답/확인 상태 인라인 표시용). 콜백은 룸 서버 액션을 감싼다.
 */
export type OnlineNightCtx = {
  roomId: string;
  requestBySeat: Map<number, NightRequestView>;
  busy: boolean;
  pushShowcase: (seat: number, characterId: string, opts?: { variant?: number; mode?: string; toSeat?: number }) => void;
  requestPick: (seat: number, characterId: string) => void;
  /** 플레이어 응답을 밤 행동으로 확정(기록+마커 적용+완료). characterId=행이 다루는 직업. */
  commitPick: (requestId: string, characterId: string) => void;
  cancelRequest: (id: string) => void;
};

export function NightActionRow({
  actor,
  spec,
  characterId,
  players,
  charMap,
  record,
  busy,
  gameId,
  onRecord,
  onClear,
  onApplyMarker,
  suggest = false,
  globalMarkers,
  votes,
  lastExecution,
  isFirstNight,
  online,
}: {
  actor: GamePlayer;
  spec: ActionSpec;
  /** 이 행이 다루는 직업 id(가짜/실제). showcase URL/ push에 핀해 같은 좌석의 다른 노드와 구분. */
  characterId: string;
  players: GamePlayer[];
  charMap: Record<string, Character>;
  record?: NightActionRecord;
  busy: boolean;
  gameId: string;
  onRecord: (targets: number[], result: string) => void;
  onClear: () => void;
  onApplyMarker: (seats: number[], markerStr: string) => void;
  /** 그리모어 상태 기반 결과 자동 추천을 켤지(실제 행동에서만). */
  suggest?: boolean;
  /** 전역 마커(Vortox 등) — 자동 추천의 취함/중독 판정용. */
  globalMarkers?: string[];
  /** 현재 페이즈 투표 기록 — 자동 추천용(추후 직업). */
  votes?: VoteRecord[];
  /** 직전 낮 처형 좌석+직업 — 장의사 자동 추천용. */
  lastExecution?: { seat: number; characterId: string } | null;
  isFirstNight?: boolean;
  /** 온라인이면 보여주기/직업목록이 폰으로 push된다(LAN이면 undefined → 새 창 링크). */
  online?: OnlineNightCtx;
}) {
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState<number[]>(record?.targets ?? []);
  const [result, setResult] = useState<string>(record?.result ?? "");
  // 받는 좌석 선택 대기 중인 showcase 변형(recipient=none일 때만 — 마술사·꼭두각시·미치광이 가짜 공격).
  const [recipPick, setRecipPick] = useState<number | null>(null);

  const marker = spec.marker ? MARKER_MAP[spec.marker] : undefined;
  const markerSeats = spec.targets === 0 ? [actor.seat] : targets;
  const canApplyMarker = !!marker && markerSeats.length > 0 && (spec.marker !== "mad" || !!result);

  // showcase 배열이면 변형 라벨(악마용/하수인용) — 보여주기 버튼 N개로 분기
  const showcaseArr = showcaseVariants(spec);
  const showcaseLabels = spec.showcaseLabels ?? [];
  const hasShowcase = showcaseArr.length > 0;

  // 지목도 결과도 마커도 *없고* showcase조차 없는 패시브 직업은 행 자체를 숨긴다.
  const nothingToRecord = spec.targets === 0 && spec.result === "none" && !marker;
  if (nothingToRecord && !record && !hasShowcase) return null;

  // 이 좌석의 활성 온라인 요청(전송/응답 상태 표시).
  const req = online?.requestBySeat.get(actor.seat) ?? null;

  // showcase URL 빌더(LAN) — as=직업 핀, mode 있으면 ?mode=, 배열이면 ?v=.
  const showcaseHref = (i: number) => {
    const s = showcaseArr[i];
    const qs: string[] = [`as=${characterId}`];
    if (s?.mode) qs.push(`mode=${s.mode}`);
    if (showcaseArr.length > 1) qs.push(`v=${i}`);
    return `/play/${gameId}/show/${actor.seat}?${qs.join("&")}`;
  };

  // 보여주기 트리거(온라인 push). recipient=none이면 받는 좌석부터 고른다.
  const doPush = (i: number, toSeat?: number) => {
    if (!online) return;
    const needsRecipient = showcaseArr[i]?.recipient === "none";
    if (needsRecipient && toSeat == null) {
      setRecipPick(i);
      return;
    }
    online.pushShowcase(actor.seat, characterId, { variant: i, mode: showcaseArr[i]?.mode, toSeat });
    setRecipPick(null);
  };

  // 보여주기: 온라인=버튼(폰 push) / LAN=새 창 링크.
  const showcaseAction = (i: number, label: string) =>
    online ? (
      <button
        key={`sc${i}`}
        type="button"
        disabled={online.busy}
        onClick={() => doPush(i)}
        title="플레이어 폰에 보여주기"
        className="inline-flex items-center gap-1 rounded bg-gold/15 px-2 py-1 text-gold hover:bg-gold/25 disabled:opacity-50"
      >
        {label}
      </button>
    ) : (
      <a
        key={`sc${i}`}
        href={showcaseHref(i)}
        target="_blank"
        rel="noopener noreferrer"
        title="결과를 새 창에 풀스크린으로 — 플레이어에게 보여주기"
        className="inline-flex items-center gap-1 rounded bg-gold/15 px-2 py-1 text-gold hover:bg-gold/25"
      >
        {label}
      </a>
    );

  // 플레이어에게 '고르게 하기' — 직업(playerPicks) 또는 대상 좌석(수도사·임프·독살자·점쟁이 등).
  //   playerPicks : 직업 선택 요청. LAN은 /pick 새 창 그리드.
  //   대상 선택   : 좌석 선택 요청(pick-players). 온라인 전용(LAN은 ST가 직접 기록).
  const picksTargets = playerChoosesTargets(characterId, spec);
  const canPick = spec.playerPicks || picksTargets;
  const pickAction = () => {
    if (!online) {
      // LAN: 직업 선택만 페이지가 있다(좌석 대상은 ST가 직접 기록).
      return spec.playerPicks ? (
        <a
          href={`/play/${gameId}/pick/${actor.seat}`}
          target="_blank"
          rel="noopener noreferrer"
          title="플레이어에게 직업 목록을 보여주고 직접 고르게 하기"
          className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-1 text-muted hover:text-text"
        >
          직업 목록
        </a>
      ) : null;
    }
    return (
      <button
        type="button"
        disabled={online.busy}
        onClick={() => online.requestPick(actor.seat, characterId)}
        title={spec.playerPicks ? "플레이어 폰에서 직업을 직접 고르게 하기" : "플레이어 폰에서 대상 좌석을 직접 고르게 하기"}
        className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-1 text-muted hover:text-text disabled:opacity-50"
      >
        {spec.playerPicks ? "직업 고르게 하기" : "대상 고르게 하기"}
      </button>
    );
  };

  const nameOf = (seat: number) => players.find((p) => p.seat === seat)?.nickname ?? `${seat}`;

  // 받는 좌석 picker(recipient=none showcase) — 데몬 등 제3자에게 보여줄 좌석을 고른다.
  const recipientPicker = () =>
    online && recipPick != null ? (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-muted">받는 좌석:</span>
        {players.map((p) => (
          <button
            key={p.seat}
            type="button"
            disabled={online.busy}
            onClick={() => doPush(recipPick, p.seat)}
            className="rounded bg-surface px-1.5 py-0.5 text-[11px] hover:bg-surface-2 disabled:opacity-50"
          >
            {short(p.nickname)}
          </button>
        ))}
        <button type="button" onClick={() => setRecipPick(null)} className="text-[11px] text-muted hover:text-text">
          취소
        </button>
      </div>
    ) : null;

  // 온라인 전송/응답 상태 — 색 뱃지로 "전송함·대기 / 확인함"을 구분. 선택 요청은 응답→기록 흐름.
  const onlineStatus = () => {
    if (!online || !req) return null;
    // 보여주기(info): 전송함/확인함 뱃지만.
    if (req.kind === "info") return <RequestStatusBadge req={req} />;
    // 직업 고르게 하기(pick): 대기 뱃지+취소 / 응답 뱃지+선택+기록.
    if (req.status === "awaiting") {
      return (
        <span className="flex items-center gap-1.5">
          <RequestStatusBadge req={req} />
          <button type="button" onClick={() => online.cancelRequest(req.id)} className="text-[11px] text-muted hover:text-red-400">취소</button>
        </span>
      );
    }
    if (req.status === "responded") {
      const nm = req.playerTargets.map(nameOf).join(", ");
      const role = req.playerChoice ? charMap[req.playerChoice]?.name.ko ?? req.playerChoice : "";
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <RequestStatusBadge req={req} />
          <span className="font-medium">{[nm, role].filter(Boolean).join(" / ") || "(빈 응답)"}</span>
          <button
            type="button"
            disabled={online.busy}
            onClick={() => online.commitPick(req.id, characterId)}
            title="이 선택을 밤 행동으로 기록하고 상태(보호·독·집착 등)를 바로 적용"
            className="rounded bg-gold/15 px-1.5 py-0.5 text-gold hover:bg-gold/25 disabled:opacity-50"
          >
            이 선택으로 기록
          </button>
        </div>
      );
    }
    return null;
  };

  // 기록할 게 없지만 showcase는 있는 케이스(마술사/꼭두각시): record 없이도 보여주기만 노출.
  const showcaseOnly = nothingToRecord && hasShowcase;
  if (showcaseOnly) {
    return (
      <div className="mt-1.5 ml-6 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {showcaseArr.map((_, i) =>
            showcaseAction(i, `보여주기${showcaseArr.length > 1 ? ` · ${showcaseLabels[i] ?? `#${i + 1}`}` : ""}`),
          )}
          {onlineStatus()}
        </div>
        {recipientPicker()}
      </div>
    );
  }

  const startEdit = () => {
    setTargets(record?.targets ?? []);
    setResult(record?.result ?? "");
    setEditing(true);
  };

  const save = () => {
    onRecord(targets, result);
    setEditing(false);
  };

  // ── 기록 요약 (편집 중 아님) ──
  if (record && !editing) {
    const resText = formatResult(spec.result, record.result, charMap);
    return (
      <div className="mt-1.5 ml-6 rounded-md border border-gold/30 bg-gold/5 px-2 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          {record.targets.length > 0 ? (
            <>
              <span className="text-muted">지목</span>
              {record.targets.map((s) => (
                <span key={s} className="rounded bg-surface-2 px-1.5 py-0.5 font-medium" title={nameOf(s)}>
                  {short(nameOf(s))}
                </span>
              ))}
            </>
          ) : (
            <span className="text-muted">지목 없음</span>
          )}
          {resText && <span className="ml-1 font-semibold text-gold">＝ {resText}</span>}
        </div>
        {INFO_KINDS.has(spec.result) &&
          record.targets
            .map((s) => {
              const p = players.find((pp) => pp.seat === s);
              return { s, w: p ? infoTargetWarn(p, characterId) : undefined };
            })
            .filter((x) => x.w)
            .map(({ s, w }) => (
              <p key={`w${s}`} className="mt-1 rounded border-l-2 border-amber-400/50 bg-amber-500/5 px-2 py-0.5 text-[11px] text-amber-300/90">
                ⚠ <span className="font-medium">{nameOf(s)}</span> — {w}
              </p>
            ))}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={startEdit} className="text-muted hover:text-text">수정</button>
          <button type="button" disabled={busy} onClick={onClear} className="text-muted hover:text-red-400 disabled:opacity-50">지우기</button>
          {canPick && pickAction()}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* result 없는 직업도 명시적 showcase가 있으면 노출(미치광이 가짜 공격 → 데몬에게). */}
            {showcaseArr.length <= 1 && (spec.result !== "none" || hasShowcase) && showcaseAction(0, "보여주기")}
            {showcaseArr.length > 1 && showcaseArr.map((_, i) => showcaseAction(i, showcaseLabels[i] ?? `#${i + 1}`))}
            {canApplyMarker && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onApplyMarker(markerSeats, markerForAction(spec.marker!, record.result))}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 disabled:opacity-50"
                style={{ background: `${marker!.color}22`, color: marker!.color }}
                title={`${marker!.label} 마커 적용`}
              >
                {marker!.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={marker!.icon} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                ) : (
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: marker!.color }}>{marker!.letter ?? "●"}</span>
                )}
                {marker!.label} 적용
              </button>
            )}
          </div>
        </div>
        {(onlineStatus() || recipPick != null) && (
          <div className="mt-1.5 border-t border-border/60 pt-1.5">
            {onlineStatus()}
            {recipientPicker()}
          </div>
        )}
      </div>
    );
  }

  // ── 행동 없음 + 미편집: 기록 버튼 ──
  if (!editing) {
    return (
      <div className="mt-1.5 ml-6 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-muted hover:border-gold/50 hover:text-gold"
          >
            ＋ 행동 기록
          </button>
          {canPick && pickAction()}
          {onlineStatus()}
        </div>
        {recipientPicker()}
      </div>
    );
  }

  // ── 편집기 ──
  return (
    <div className="mt-1.5 ml-6 space-y-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
      <ActionFields
        spec={spec}
        players={players}
        charMap={charMap}
        actorSeat={actor.seat}
        actorCharacterId={characterId}
        targets={targets}
        setTargets={setTargets}
        result={result}
        setResult={setResult}
        suggest={suggest}
        globalMarkers={globalMarkers}
        votes={votes}
        lastExecution={lastExecution}
        isFirstNight={isFirstNight}
      />

      {canApplyMarker && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onApplyMarker(markerSeats, markerForAction(spec.marker!, result))}
          className="inline-flex items-center gap-1 rounded px-2 py-1 disabled:opacity-50"
          style={{ background: `${marker!.color}22`, color: marker!.color }}
        >
          {marker!.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marker!.icon} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
          ) : (
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: marker!.color }}>{marker!.letter ?? "●"}</span>
          )}
          {marker!.label} 대상 적용
        </button>
      )}

      <div className="flex gap-2 pt-0.5">
        <button type="button" disabled={busy} onClick={save} className="rounded bg-gold px-3 py-1 font-semibold text-bg disabled:opacity-50">저장</button>
        <button type="button" onClick={() => setEditing(false)} className="rounded border border-border px-2 py-1 text-muted hover:text-text">취소</button>
      </div>
    </div>
  );
}
