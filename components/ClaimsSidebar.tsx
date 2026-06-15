"use client";

import { useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import { formatResult, specForPhase } from "@/lib/night-actions";
import type { Character, Game, NightActionRecord } from "@/lib/types";
import { ActionFields } from "./ActionFields";
import { PlayerPicker } from "./PlayerPicker";
import { RolePickerModal } from "./RolePickerModal";

function Chevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ClaimForm({
  game,
  charMap,
  phase,
  init,
  lockIdentity,
  onSave,
  onCancel,
}: {
  game: Game;
  charMap: Record<string, Character>;
  phase: string;
  init?: { seat: number; role: string; targets: number[]; result: string };
  lockIdentity?: boolean;
  onSave: (seat: number, role: string, targets: number[], result: string) => void;
  onCancel: () => void;
}) {
  const [seat, setSeat] = useState<number | "">(init?.seat ?? "");
  const [role, setRole] = useState<string>(init?.role ?? "");
  const [targets, setTargets] = useState<number[]>(init?.targets ?? []);
  const [result, setResult] = useState<string>(init?.result ?? "");
  const [roleOpen, setRoleOpen] = useState(false);
  const ready = seat !== "" && !!role;
  const spec = role ? specForPhase(role, phase) : undefined;
  const roleOpts = Object.values(charMap).sort((a, b) => a.name.ko.localeCompare(b.name.ko, "ko"));
  const roleCh = role ? charMap[role] : undefined;

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
      <div className="flex flex-col gap-1.5">
        <PlayerPicker
          players={game.players}
          value={seat === "" ? null : seat}
          onChange={(s) => setSeat(s ?? "")}
          disabled={lockIdentity}
          placeholder="주장한 플레이어…"
          title="주장한 플레이어"
        />
        <button
          type="button"
          disabled={lockIdentity}
          onClick={() => setRoleOpen(true)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-left outline-none hover:border-gold/60 disabled:opacity-60"
        >
          {roleCh ? (
            <>
              {roleCh.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={roleCh.image} alt="" className="h-4 w-4 rounded-full object-cover" />
              )}
              <span style={{ color: TEAM_MAP[roleCh.team]?.color }}>{roleCh.name.ko}</span>
            </>
          ) : (
            <span className="text-muted">주장한 직업…</span>
          )}
          <span className="ml-auto text-muted">▾</span>
        </button>
        <RolePickerModal
          open={roleOpen}
          title="주장한 직업"
          candidates={roleOpts}
          selected={role}
          onPick={(id) => { setRole(id); setTargets([]); setResult(""); }}
          onClose={() => setRoleOpen(false)}
        />
      </div>

      {ready && spec && (
        <ActionFields
          spec={spec}
          players={game.players}
          charMap={charMap}
          actorSeat={seat as number}
          targets={targets}
          setTargets={setTargets}
          result={result}
          setResult={setResult}
        />
      )}

      <div className="flex gap-2 pt-0.5">
        <button type="button" disabled={!ready} onClick={() => onSave(seat as number, role, targets, result)} className="rounded bg-gold px-3 py-1 font-semibold text-bg disabled:opacity-40">저장</button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-2 py-1 text-muted hover:text-text">취소</button>
      </div>
    </div>
  );
}

export function ClaimsSidebar({
  game,
  charMap,
  phase,
  busy,
  onRecordClaim,
  onClearClaim,
  onClose,
}: {
  game: Game;
  charMap: Record<string, Character>;
  phase: string;
  busy: boolean;
  onRecordClaim: (seat: number, role: string, targets: number[], result: string) => void;
  onClearClaim: (seat: number, role: string) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const claims = game.actions.filter((a) => a.bluff);
  const nameOf = (seat: number) => game.players.find((p) => p.seat === seat)?.nickname ?? `${seat}`;
  const key = (a: NightActionRecord) => `${a.actorSeat}:${a.characterId}`;

  return (
    <aside className="flex w-full shrink-0 flex-col md:h-[70vh] md:w-72 md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">주장 기록<span className="ml-1 font-normal text-muted">· {claims.length}</span></span>
        <button type="button" onClick={onClose} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"><Chevron /></button>
      </div>

      <div className="space-y-2 p-3 md:flex-1 md:overflow-y-auto">
        <p className="text-[11px] text-muted">누구나 임의 직업을 공개적으로 주장(블러핑)할 수 있습니다. 실제 직업과 무관하게 기록됩니다.</p>

        {claims.length === 0 && !adding && (
          <p className="py-2 text-xs text-muted">기록된 주장이 없습니다.</p>
        )}

        {claims.map((c) => {
          const ch = charMap[c.characterId];
          const k = key(c);
          if (editKey === k) {
            return (
              <ClaimForm
                key={k}
                game={game}
                charMap={charMap}
                phase={phase}
                lockIdentity
                init={{ seat: c.actorSeat, role: c.characterId, targets: c.targets, result: c.result }}
                onSave={(seat, role, targets, result) => { onRecordClaim(seat, role, targets, result); setEditKey(null); }}
                onCancel={() => setEditKey(null)}
              />
            );
          }
          const resText = formatResult(specForPhase(c.characterId, phase).result, c.result, charMap);
          return (
            <div key={k} className="rounded-md border border-border bg-surface-2/60 px-2 py-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-medium">{nameOf(c.actorSeat)}</span>
                <span className="text-muted">주장:</span>
                <span style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}>{ch?.name.ko ?? c.characterId}</span>
              </div>
              {(c.targets.length > 0 || resText) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-muted">
                  {c.targets.length > 0 && <span>→ {c.targets.map(nameOf).join(", ")}</span>}
                  {resText && <span className="font-semibold text-gold">＝ {resText}</span>}
                </div>
              )}
              <div className="mt-1 flex gap-2">
                <button type="button" onClick={() => setEditKey(k)} className="text-muted hover:text-text">수정</button>
                <button type="button" disabled={busy} onClick={() => onClearClaim(c.actorSeat, c.characterId)} className="text-muted hover:text-red-400 disabled:opacity-50">지우기</button>
              </div>
            </div>
          );
        })}

        {adding ? (
          <ClaimForm
            game={game}
            charMap={charMap}
            phase={phase}
            onSave={(seat, role, targets, result) => { onRecordClaim(seat, role, targets, result); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted hover:border-gold/50 hover:text-gold"
          >
            ＋ 주장 추가
          </button>
        )}
      </div>
    </aside>
  );
}
