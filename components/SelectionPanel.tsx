"use client";

import { useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import { DURATION_LABEL, MARKERS, parseMarker } from "@/lib/markers";
import type { Character, Game, GamePlayer } from "@/lib/types";
import { RolePickerModal } from "./RolePickerModal";
import {
  releaseSeatAction,
  setAlignmentAction,
  setMemoAction,
  setNicknameAction,
  setRoleAction,
  setStatusAction,
  swapSeatsAction,
  toggleGhostVoteAction,
  toggleLockAction,
  toggleMarkerAction,
} from "@/app/play/actions";

const ALIGN_COLOR: Record<"good" | "evil", string> = { good: "#4a90d9", evil: "#d23b3b" };

type Run = (fn: () => Promise<Game | { error: string }>) => void;

/**
 * 좌석 하단 고정 패널 — 닉네임/자리 교환(1일차 밤), 직업 변경, 사망·고정·진영, 마커, 메모.
 * 이전엔 PlayCanvas 안에 직접 인라인이었으나 분리.
 */
export function SelectionPanel({
  sel,
  game,
  charMap,
  sheetChars,
  canEditRoles,
  knownNicknames = [],
  run,
  onClose,
}: {
  sel: GamePlayer;
  game: Game;
  charMap: Record<string, Character>;
  sheetChars: Character[];
  canEditRoles: boolean;
  knownNicknames?: string[];
  run: Run;
  onClose: () => void;
}) {
  const [showRoles, setShowRoles] = useState(false);
  const [markerPicker, setMarkerPicker] = useState<string | null>(null);

  return (
    <div data-selection-panel className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto max-w-[88rem] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-semibold">{sel.nickname}</span>
            <span
              className="ml-2"
              style={{ color: charMap[sel.characterId] ? TEAM_MAP[charMap[sel.characterId].team]?.color : undefined }}
            >
              {charMap[sel.characterId]?.name.ko ?? sel.characterId}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-text">
            닫기
          </button>
        </div>

        {/* 1일차 밤 세팅: 닉네임 수정 + 자리(닉네임만) 교환. 직업은 좌석에 고정. */}
        {canEditRoles && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
            <span className="text-xs text-muted">닉네임</span>
            <datalist id="known-nicks">
              {knownNicknames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <input
              key={`nick-${sel.seat}`}
              defaultValue={sel.nickname}
              list="known-nicks"
              onBlur={(e) => {
                if (e.target.value !== sel.nickname)
                  run(() => setNicknameAction(game.id, sel.seat, e.target.value));
              }}
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
                <option key={p.seat} value={p.seat}>
                  {p.nickname}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 1일차 밤 직업 변경 */}
        {canEditRoles && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowRoles((v) => !v)}
              className="text-sm text-gold hover:underline"
            >
              직업 변경 {showRoles ? "▾" : "▸"}
            </button>
            {showRoles && (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2">
                <p className="mb-1.5 text-xs text-muted">
                  다른 플레이어가 가진 직업(흐림)을 누르면 서로 교체됩니다.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sheetChars.map((c) => {
                    const mine = sel.characterId === c.id;
                    const dup = game.players.some(
                      (p) => p.seat !== sel.seat && p.characterId === c.id,
                    );
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={mine}
                        title={dup ? "교체" : c.name.ko}
                        onClick={() => run(() => setRoleAction(game.id, sel.seat, c.id))}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                          mine
                            ? "border-gold bg-gold/15 text-gold"
                            : dup
                              ? "border-border opacity-45 hover:opacity-80"
                              : "border-border hover:bg-surface"
                        }`}
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
          <button
            type="button"
            onClick={() =>
              run(() => setStatusAction(game.id, sel.seat, sel.status === "dead" ? "alive" : "dead"))
            }
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:text-text"
          >
            {sel.status === "dead" ? "부활" : "사망 처리"}
          </button>
          {sel.status === "dead" && (
            <>
              <select
                value={sel.deathCause}
                onChange={(e) => run(() => setStatusAction(game.id, sel.seat, "dead", e.target.value))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold/60"
                title="사망 원인"
              >
                <option value="">원인 미지정</option>
                <option value="night">밤 살해</option>
                <option value="execution">처형</option>
                <option value="other">기타</option>
              </select>
              <button
                type="button"
                onClick={() => run(() => toggleGhostVoteAction(game.id, sel.seat, !sel.ghostVoteUsed))}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
                style={
                  sel.ghostVoteUsed
                    ? { borderColor: "var(--color-border)", opacity: 0.6 }
                    : { borderColor: "#d4a23a88", color: "#d4a23a", background: "#d4a23a1a" }
                }
              >
                🗳️ {sel.ghostVoteUsed ? "유령표 사용함" : "유령표 사용 가능"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => run(() => toggleLockAction(game.id, sel.seat, !sel.locked))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:text-text"
          >
            {sel.locked ? "고정 해제" : "위치 고정"}
          </button>
          {game.claimedSeats.includes(sel.seat) && (
            <button
              type="button"
              onClick={() => run(() => releaseSeatAction(game.id, sel.seat))}
              title="직업배포 점유 해제 — 이 플레이어가 배포 링크에서 자기 직업을 다시 30초간 볼 수 있게 합니다"
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "#d4a23a88", color: "#d4a23a", background: "#d4a23a14" }}
            >
              🔓 직업 재열람 허용
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              run(() =>
                setAlignmentAction(game.id, sel.seat, sel.alignment === "good" ? "evil" : "good"),
              )
            }
            title="진영 토글 (politician/mezepheles/cult leader 등)"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{
              borderColor: ALIGN_COLOR[sel.alignment],
              color: ALIGN_COLOR[sel.alignment],
              background: `${ALIGN_COLOR[sel.alignment]}1a`,
            }}
          >
            ⇄ {sel.alignment === "good" ? "선" : "악"} 진영
          </button>
          <span className="mx-1 text-muted">|</span>
          {MARKERS.filter((m) => !m.needsTarget && m.scope !== "global").map((m) => {
            const on = sel.markers.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => run(() => toggleMarkerAction(game.id, sel.seat, m.id))}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors"
                style={
                  on
                    ? { background: `${m.color}22`, color: m.color, borderColor: `${m.color}88` }
                    : { borderColor: "var(--color-border)" }
                }
              >
                {m.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.icon} alt="" draggable={false} className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]" style={{ background: `${m.color}33`, color: m.color }}>{m.letter ?? "●"}</span>
                )}
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
                style={
                  curParam
                    ? { background: `${mk.color}22`, color: mk.color, borderColor: `${mk.color}88` }
                    : { borderColor: "var(--color-border)" }
                }
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
        <textarea
          key={sel.seat}
          defaultValue={sel.memo}
          onBlur={(e) => {
            if (e.target.value !== sel.memo) run(() => setMemoAction(game.id, sel.seat, e.target.value));
          }}
          placeholder="이 플레이어 메모 (게임 내내 유지)…"
          rows={2}
          className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60"
        />
      </div>
    </div>
  );
}
