"use client";

import { useState } from "react";
import type { Game, VoteRecord } from "@/lib/types";
import { PlayerPicker } from "./PlayerPicker";

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
  onSave,
  onCancel,
}: {
  game: Game;
  init?: VoteRecord;
  lockNominee?: boolean;
  onSave: (nominator: number, nominee: number, votes: number, executed: boolean) => void;
  onCancel: () => void;
}) {
  const [nominator, setNominator] = useState<number | "">(init?.nominator ?? "");
  const [nominee, setNominee] = useState<number | "">(init?.nominee ?? "");
  const [votes, setVotes] = useState<string>(init ? String(init.votes) : "");
  const [executed, setExecuted] = useState<boolean>(init?.executed ?? false);
  const ready = nominator !== "" && nominee !== "";

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-muted">지목자</span>
          <PlayerPicker className="flex-1" players={game.players} value={nominator === "" ? null : nominator} onChange={(s) => setNominator(s ?? "")} placeholder="선택…" title="지목자" />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-muted">대상</span>
          <PlayerPicker className="flex-1" players={game.players} value={nominee === "" ? null : nominee} onChange={(s) => setNominee(s ?? "")} disabled={lockNominee} placeholder="선택…" title="지목 대상" />
        </div>
        <label className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-muted">찬성표</span>
          <input type="number" min={0} value={votes} onChange={(e) => setVotes(e.target.value)} className="w-20 rounded border border-border bg-surface px-2 py-1 outline-none focus:border-gold/60" />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={executed} onChange={(e) => setExecuted(e.target.checked)} />
          <span>처형됨</span>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!ready} onClick={() => onSave(nominator as number, nominee as number, Number(votes) || 0, executed)} className="rounded bg-gold px-3 py-1 font-semibold text-bg disabled:opacity-40">저장</button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-2 py-1 text-muted hover:text-text">취소</button>
      </div>
    </div>
  );
}

export function VotesSidebar({
  game,
  busy,
  onRecordVote,
  onClearVote,
  onToggleGhostVote,
  onClose,
}: {
  game: Game;
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
  const ghostLeft = dead.filter((p) => !p.ghostVoteUsed).length;

  return (
    <aside className="flex h-[70vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:w-72">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">지목·투표<span className="ml-1 font-normal text-muted">· {game.votes.length}</span></span>
        <button type="button" onClick={onClose} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"><Chevron /></button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
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
                onClick={() => onToggleGhostVote(p.seat, !p.ghostVoteUsed)}
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
                onSave={(nom, nee, votes, ex) => { onRecordVote(nom, nee, votes, ex); setEditNominee(null); }}
                onCancel={() => setEditNominee(null)}
              />
            );
          }
          return (
            <div key={v.nominee} className={`rounded-md border px-2 py-1.5 text-xs ${v.executed ? "border-red-500/50 bg-red-500/10" : "border-border bg-surface-2/60"}`}>
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-medium">{nameOf(v.nominator)}</span>
                <span className="text-muted">→</span>
                <span className="font-medium">{nameOf(v.nominee)}</span>
                <span className="ml-1 rounded bg-surface px-1.5 py-0.5 font-semibold text-gold">{v.votes}표</span>
                {v.executed && <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-semibold text-red-400">처형</span>}
              </div>
              <div className="mt-1 flex gap-2">
                <button type="button" onClick={() => setEditNominee(v.nominee)} className="text-muted hover:text-text">수정</button>
                <button type="button" disabled={busy} onClick={() => onClearVote(v.nominee)} className="text-muted hover:text-red-400 disabled:opacity-50">지우기</button>
              </div>
            </div>
          );
        })}

        {adding ? (
          <VoteForm
            game={game}
            onSave={(nom, nee, votes, ex) => { onRecordVote(nom, nee, votes, ex); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted hover:border-gold/50 hover:text-gold">
            ＋ 지목 추가
          </button>
        )}
      </div>
    </aside>
  );
}
