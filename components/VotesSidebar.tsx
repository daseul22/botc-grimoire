"use client";

import { useState } from "react";
import type { Character, Game, VoteRecord } from "@/lib/types";
import { PlayerPicker } from "./PlayerPicker";
import { computeTally, type CutoffInfo } from "@/lib/voting";

const DEATH_GLYPH: Record<string, string> = { execution: "☠️", night: "🌙", other: "✕", "": "✕" };
const DEATH_TITLE: Record<string, string> = {
  execution: "처형됨",
  night: "밤에 사망",
  other: "기타 사망",
  "": "사망",
};

function Chevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function VoteForm({
  game,
  init,
  lockNominee,
  cutoffInfo,
  onSave,
  onCancel,
}: {
  game: Game;
  init?: VoteRecord;
  lockNominee?: boolean;
  /** 선택된 대상에 맞는 커트라인(처형/추방). 찬성표 입력 시 충족 여부를 바로 보여준다. */
  cutoffInfo: (nomineeSeat: number | "") => CutoffInfo;
  onSave: (nominator: number, nominee: number, votes: number, executed: boolean) => void;
  onCancel: () => void;
}) {
  const [nominator, setNominator] = useState<number | "">(init?.nominator ?? "");
  const [nominee, setNominee] = useState<number | "">(init?.nominee ?? "");
  const [votes, setVotes] = useState<string>(init ? String(init.votes) : "");
  const ready = nominator !== "" && nominee !== "";
  const voteNum = Number(votes) || 0;
  const ci = cutoffInfo(nominee);
  const meetsCutoff = votes !== "" && voteNum >= ci.value;

  // 같은 낮: 이미 지목한 사람은 다시 지목 못 하고, 이미 지목받은 사람은 다시 지목 대상이 못 된다.
  // 편집 중인 레코드(같은 nominee)는 제외해 현재 값은 그대로 둔다.
  const others = game.votes.filter((v) => !init || v.nominee !== init.nominee);
  const usedNominators = new Set(others.map((v) => v.nominator));
  const usedNominees = new Set(others.map((v) => v.nominee));

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-muted">지목자</span>
          <PlayerPicker className="flex-1" players={game.players} value={nominator === "" ? null : nominator} onChange={(s) => setNominator(s ?? "")} placeholder="선택…" title="지목자" disabledSeats={usedNominators} disabledNote="이미 지목함" />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-muted">대상</span>
          <PlayerPicker className="flex-1" players={game.players} value={nominee === "" ? null : nominee} onChange={(s) => setNominee(s ?? "")} disabled={lockNominee} placeholder="선택…" title="지목 대상" disabledSeats={usedNominees} disabledNote="이미 지목받음" />
        </div>
        <label className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-muted">찬성표</span>
          <input type="number" min={0} value={votes} onChange={(e) => setVotes(e.target.value)} className="w-20 rounded border border-border bg-surface px-2 py-1 outline-none focus:border-gold/60" />
          {votes !== "" && (
            <span className={`text-[11px] ${meetsCutoff ? "text-green-400" : "text-muted"}`}>
              {meetsCutoff ? `${ci.word} ✓ (커트라인 ${ci.value}표)` : `${ci.word}까지 ${ci.value - voteNum}표 (커트라인 ${ci.value})`}
            </span>
          )}
        </label>
      </div>
      <div className="flex gap-2">
        {/* 처형 여부는 카드의 '처형하기' 버튼으로 — 기존 executed 값은 보존한다. */}
        <button type="button" disabled={!ready} onClick={() => onSave(nominator as number, nominee as number, Number(votes) || 0, init?.executed ?? false)} className="rounded bg-gold px-3 py-1 font-semibold text-bg disabled:opacity-40">저장</button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-2 py-1 text-muted hover:text-text">취소</button>
      </div>
    </div>
  );
}

export function VotesSidebar({
  game,
  charMap,
  busy,
  onRecordVote,
  onClearVote,
  onToggleGhostVote,
  onClose,
}: {
  game: Game;
  charMap: Record<string, Character>;
  busy: boolean;
  onRecordVote: (nominator: number, nominee: number, votes: number, executed: boolean) => void;
  onClearVote: (nominee: number) => void;
  onToggleGhostVote: (seat: number, used: boolean) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editNominee, setEditNominee] = useState<number | null>(null);
  const nameOf = (seat: number) => game.players.find((p) => p.seat === seat)?.nickname ?? `${seat}`;
  const dead = game.players.filter((p) => p.status === "dead");
  // 정산 계산은 lib/voting의 순수 함수로(온라인 DayConsole과 규칙 공유). 처형으로 죽은 좌석은
  // 그 낮 '투표 당시' 인원이라 생존 수에 도로 포함 — 처형 후 커트라인이 흔들리지 않게.
  const {
    aliveCount,
    travellerCount,
    ghostLeft,
    executionCutoff,
    highestVotes,
    topCount,
    isTie,
    tieBlocks,
    leaderSeat,
    maxFutureVotes,
    canExceed,
    canTieOnly,
    hasExecuted,
    cutoffInfo,
  } = computeTally(game.players, game.votes, charMap);

  return (
    <aside className="flex w-full shrink-0 flex-col md:h-[70vh] md:w-72 md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">지목·투표<span className="ml-1 font-normal text-muted">· {game.votes.length}</span></span>
        <button type="button" onClick={onClose} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"><Chevron /></button>
      </div>

      <div className="space-y-2 p-3 md:flex-1 md:overflow-y-auto">
        {/* 사망자 · 유령표 — 투표 정산 시 누가 죽었고 데드보트가 몇 개 남았는지 한눈에. 탭으로 유령표 토글. */}
        {dead.length > 0 && (
          <div className="space-y-1 rounded-md border border-border bg-surface-2/40 p-2">
            <p className="text-[11px] font-semibold text-muted">
              사망자 · 유령표 <span className="font-normal text-gold">{ghostLeft}/{dead.length} 남음</span>
            </p>
            {dead.map((p) => (
              <button
                key={p.seat}
                type="button"
                disabled={busy}
                onClick={() => {
                  // 사용함 → 사용 가능 복구는 실수 방지를 위해 확인. 사용 처리는 바로.
                  if (p.ghostVoteUsed && !confirm(`${p.nickname}의 유령표를 '사용 가능'으로 되돌릴까요?`)) return;
                  onToggleGhostVote(p.seat, !p.ghostVoteUsed);
                }}
                title={p.ghostVoteUsed ? "유령표 사용함 — 탭해서 복구" : "유령표 사용 가능 — 탭해서 사용 처리"}
                className="flex w-full items-center justify-between gap-2 rounded border border-border bg-surface px-2 py-1 text-xs disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span title={DEATH_TITLE[p.deathCause] ?? "사망"}>{DEATH_GLYPH[p.deathCause] ?? "✕"}</span>
                  <span className="truncate font-medium">{p.nickname}</span>
                </span>
                <span className="shrink-0 tabular-nums" style={p.ghostVoteUsed ? { opacity: 0.45 } : { color: "#d4a23a" }}>
                  🗳️ {p.ghostVoteUsed ? "사용함" : "사용 가능"}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 투표 정산 — 처형 커트라인(생존 과반) + 현재 최다(동률 인지) + 다음 지목으로 뒤집을 수 있는지 */}
        {aliveCount > 0 && (
          <div className="space-y-1 rounded-md border border-border bg-surface-2/40 p-2 text-[11px]">
            <p className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-muted">처형 커트라인 <span className="opacity-70">· 생존 {aliveCount}명{travellerCount > 0 ? `(여행자 ${travellerCount})` : ""} 과반</span></span>
              <span className="shrink-0 font-semibold tabular-nums text-gold">{executionCutoff}표 이상</span>
            </p>
            {game.votes.length > 0 && (
              <>
                <p className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-muted">현재 최다</span>
                  {isTie ? (
                    <span className={`min-w-0 truncate text-right font-semibold tabular-nums ${tieBlocks ? "text-amber-300" : "text-text"}`}>
                      동률 {topCount}명 · {highestVotes}표{tieBlocks ? " · 처형 없음" : ""}
                    </span>
                  ) : (
                    <span className="min-w-0 truncate text-right font-semibold tabular-nums">
                      {leaderSeat != null ? `${nameOf(leaderSeat)} · ${highestVotes}표` : "—"}
                    </span>
                  )}
                </p>
                {hasExecuted ? (
                  <p className="flex items-center justify-between gap-2 text-red-300">
                    <span className="shrink-0">처형 확정</span>
                    <span className="shrink-0 font-semibold">이 낮의 지목 종료</span>
                  </p>
                ) : (
                  <p className={`flex items-center justify-between gap-2 ${canExceed ? "text-muted" : canTieOnly ? "text-sky-300" : "text-amber-300"}`}>
                    <span className="shrink-0">다음 지목 최대 <span className="opacity-70">· 생존{aliveCount}+유령{ghostLeft}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {maxFutureVotes}표 · {canExceed ? "넘길 수 있음" : canTieOnly ? "동률까지" : "못 넘김"}
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {game.votes.length === 0 && !adding && (
          <p className="py-2 text-xs text-muted">이 낮의 지목 기록이 없습니다.</p>
        )}

        {game.votes.map((v) => {
          if (editNominee === v.nominee) {
            return (
              <VoteForm
                key={v.nominee}
                game={game}
                init={v}
                lockNominee
                cutoffInfo={cutoffInfo}
                onSave={(nom, nee, votes, ex) => { onRecordVote(nom, nee, votes, ex); setEditNominee(null); }}
                onCancel={() => setEditNominee(null)}
              />
            );
          }
          const ci = cutoffInfo(v.nominee);
          const tiedTop = isTie && v.votes === highestVotes; // 이 지목이 동률 1위 중 하나
          // 처형 대상: 단독 최다 + 커트라인 충족(동률이면 처형 없음). ST가 명시적으로 눌러야 처형.
          const executable = !isTie && v.votes === highestVotes && v.votes >= ci.value;
          return (
            <div key={v.nominee} className={`rounded-md border px-2 py-1.5 text-xs ${v.executed ? "border-red-500/50 bg-red-500/10" : "border-border bg-surface-2/60"}`}>
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-medium">{nameOf(v.nominator)}</span>
                <span className="text-muted">→</span>
                <span className="font-medium">{nameOf(v.nominee)}</span>
                <span className="ml-1 rounded bg-surface px-1.5 py-0.5 font-semibold text-gold">{v.votes}표</span>
                {v.votes >= ci.value ? (
                  <span className="rounded bg-green-500/15 px-1.5 py-0.5 font-semibold text-green-400" title={ci.tip}>{ci.word} ✓</span>
                ) : (
                  <span className="rounded bg-surface px-1.5 py-0.5 text-muted" title={`${ci.word} 커트라인 ${ci.value}표 미달`}>{ci.word}까지 {ci.value - v.votes}표</span>
                )}
                {tiedTop && !v.executed && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300" title="최다 득표가 동률 — 단독 최다가 아니면 처형되지 않음">동률</span>
                )}
                {v.executed && <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-semibold text-red-400">처형</span>}
              </div>
              {/* 처형: 조건 충족 시에도 '아무 일도 안 일어나는' 능력이 있을 수 있어, ST가 명시적으로 눌러야 처형된다. */}
              {executable && !v.executed && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { if (confirm(`${nameOf(v.nominee)}을(를) 처형할까요? (좌석이 사망 처리됩니다)`)) onRecordVote(v.nominator, v.nominee, v.votes, true); }}
                  className="mt-1.5 w-full rounded bg-red-500/20 px-2 py-1 font-semibold text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                >
                  ☠️ 이 플레이어 처형하기
                </button>
              )}
              <div className="mt-1 flex gap-2">
                <button type="button" onClick={() => setEditNominee(v.nominee)} className="text-muted hover:text-text">수정</button>
                {v.executed && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { if (confirm("처형 표시를 취소할까요? (사망 좌석은 그리모어에서 직접 되살리세요)")) onRecordVote(v.nominator, v.nominee, v.votes, false); }}
                    className="text-muted hover:text-text disabled:opacity-50"
                  >처형 취소</button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { if (confirm("이 지목 기록을 지울까요?")) onClearVote(v.nominee); }}
                  className="text-muted hover:text-red-400 disabled:opacity-50"
                >지우기</button>
              </div>
            </div>
          );
        })}

        {adding ? (
          <VoteForm
            game={game}
            cutoffInfo={cutoffInfo}
            onSave={(nom, nee, votes, ex) => { onRecordVote(nom, nee, votes, ex); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <div className="space-y-1">
            {!hasExecuted && !canExceed && !canTieOnly && game.votes.length > 0 && (
              <p className="rounded border-l-2 border-amber-400/50 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-300/90">
                남은 표(최대 {maxFutureVotes}표)로는 현재 최다 {highestVotes}표에 못 미쳐요 — 추가 지목은 결과를 바꾸지 못합니다.
              </p>
            )}
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted hover:border-gold/50 hover:text-gold">
              ＋ 지목 추가
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
