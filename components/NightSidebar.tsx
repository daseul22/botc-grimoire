"use client";

import { TEAM_MAP } from "@/lib/constants";
import { effectiveCharacterId, isTainted } from "@/lib/markers";
import { actionSpec, INFO_KINDS } from "@/lib/night-actions";
import type { Character, Game, NightAction } from "@/lib/types";
import { NightActionRow } from "./NightActionRow";
import { LunaticActionRow } from "./LunaticActionRow";
import {
  clearActionAction,
  recordActionAction,
  setLunaticBluffsAction,
  setLunaticMinionsAction,
  toggleDoneAction,
} from "@/app/play/actions";

type Run = (fn: () => Promise<Game | { error: string }>) => void;

type RoleItem = {
  kind: "role";
  order: number;
  p: Game["players"][number];
  effId: string;
  na: NonNullable<NightAction>;
};
type InfoItem = { kind: "info"; order: number; infoKind: "minion" | "demon" };

/**
 * 🌙 밤 행동 순서 사이드바. 순서 계산(effective character + 정보 노드 포함)도 여기서 한다.
 *
 * 첫밤 ST 운영서 별도 단계로 진행되는 두 정보 노드(botc 공식 firstNight order 기준):
 * 룰상 마술사(magician=18) → MINION_INFO(19) → 미치광이(lunatic=21) → DEMON_INFO(22) 순.
 * 일부 직업(철학자=14, 세레노버스=42 등)은 이 노드 앞·뒤에 위치한다.
 */
export function NightSidebar({
  game,
  charMap,
  sheetChars,
  isFirstNight,
  busy,
  run,
  onApplyMarker,
  onClose,
}: {
  game: Game;
  charMap: Record<string, Character>;
  sheetChars: Character[];
  isFirstNight: boolean;
  busy: boolean;
  run: Run;
  onApplyMarker: (seats: number[], markerStr: string) => void;
  onClose: () => void;
}) {
  // 좌석마다 실제 운영상 어떤 직업으로 다루는지(disguise / gained / became 마커 반영).
  // 미치광이는 데몬처럼, 식인종은 처형된 town 능력처럼, 임프 자살자는 새 직업으로 노출.
  const roles: RoleItem[] = game.players.flatMap((p) => {
    const effId = effectiveCharacterId(p.seat, p.characterId, p.markers, game.disguises);
    const nightOf = (id: string) =>
      (isFirstNight ? charMap[id]?.firstNight : charMap[id]?.otherNight) as NightAction;
    const out: RoleItem[] = [];
    const na = nightOf(effId);
    if (na) out.push({ kind: "role", order: na.order, p, effId, na });
    // disguise 좌석(미치광이·꼭두각시)은 가짜 직업이 행동 순서를 대체하지만, 본체의 운영
    // 단계(미치광이 가짜 블러핑·하수인 지정, 꼭두각시 보여주기)는 별도로 필요 — 본체 노드도 노출.
    if (game.disguises?.[p.seat] && effId !== p.characterId) {
      const realNa = nightOf(p.characterId);
      if (realNa) out.push({ kind: "role", order: realNa.order, p, effId: p.characterId, na: realNa });
    }
    return out;
  });
  const items: (RoleItem | InfoItem)[] = [...roles];
  if (isFirstNight) {
    // 정보 노드는 *실제* 게임 구성에 따라 노출 (effective char 무관).
    const hasMinion = game.players.some((p) => charMap[p.characterId]?.team === "minion");
    const hasDemon = game.players.some((p) => charMap[p.characterId]?.team === "demon");
    if (hasMinion) items.push({ kind: "info", order: 19, infoKind: "minion" });
    if (hasDemon) items.push({ kind: "info", order: 22, infoKind: "demon" });
  }
  items.sort((a, b) => a.order - b.order);

  return (
    <aside className="flex h-[70vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:w-72">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">
          🌙 {isFirstNight ? "첫째 밤" : "그 외 밤"} 행동 순서
          <span className="ml-1 font-normal text-muted">· {items.length}</span>
        </span>
        <button type="button" onClick={onClose} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">이 밤에 행동하는 직업이 없습니다.</p>
      ) : (
        <ol className="flex-1 divide-y divide-border overflow-y-auto">
          {items.map((item, i) => {
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
                    <span className="font-semibold" style={{ color: "#d23b3b" }}>
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
            const { p, na, effId } = item;
            // ch = 운영상 다루는 직업(가짜/획득), realCh = 좌석에 적힌 진짜 직업.
            const ch = charMap[effId];
            const realCh = effId !== p.characterId ? charMap[p.characterId] : undefined;
            // 본체 노드(disguise 좌석의 진짜 직업 행)에는 반대로 가짜 직업을 뱃지로 표기.
            const fakeId = game.disguises?.[p.seat];
            const fakeCh = effId === p.characterId && fakeId && fakeId !== p.characterId ? charMap[fakeId] : undefined;
            const dead = p.status === "dead";
            const done = game.doneSeats.includes(p.seat);
            return (
              <li key={`${p.seat}-${effId}`} className={`px-3 py-2 ${dead ? "opacity-45" : ""} ${done ? "opacity-55" : ""}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-4 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                  <span className="relative inline-flex shrink-0">
                    {ch?.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ch.image} alt="" className="h-6 w-6 rounded-full object-cover" />
                    )}
                    {realCh?.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={realCh.image}
                        alt=""
                        title={`원래 직업: ${realCh.name.ko}`}
                        className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-bg object-cover ring-1 ring-border"
                      />
                    )}
                  </span>
                  <span className={`font-medium ${dead ? "line-through" : ""}`}>{p.nickname}</span>
                  <span className="text-xs" style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}>{ch?.name.ko ?? effId}</span>
                  {realCh && <span className="rounded bg-purple-500/15 px-1 py-0.5 text-[10px] font-medium text-purple-300" title={`실제 직업: ${realCh.name.ko}`}>←{realCh.name.ko}</span>}
                  {fakeCh && <span className="rounded bg-purple-500/15 px-1 py-0.5 text-[10px] font-medium text-purple-300" title={`가짜 직업: ${fakeCh.name.ko}`}>→{fakeCh.name.ko}</span>}
                  {isTainted(p.markers, game.globalMarkers) && INFO_KINDS.has(actionSpec(effId).result) && <span className="rounded bg-amber-500/20 px-1 text-[10px] font-medium text-amber-400" title="취함/중독 — 거짓 정보를 줘야 합니다">⚠ 거짓</span>}
                  {dead && <span className="text-xs text-red-400">사망</span>}
                  <button type="button" title={done ? "처리 완료 해제" : "처리 완료"} onClick={() => run(() => toggleDoneAction(game.id, p.seat))} className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${done ? "border-green-500 bg-green-500/20 text-green-400" : "border-border text-muted hover:border-green-500/60"}`}>✓</button>
                </div>
                {na.reminder?.ko && <p className="mt-1 whitespace-pre-line break-words pl-6 text-xs text-muted">{na.reminder.ko}</p>}
                {effId === "lunatic" ? (
                  <LunaticActionRow
                    gameId={game.id}
                    game={game}
                    actorSeat={p.seat}
                    sheetChars={sheetChars}
                    charMap={charMap}
                    busy={busy}
                    onSetBluffs={(ids) => run(() => setLunaticBluffsAction(game.id, ids))}
                    onSetMinions={(seats) => run(() => setLunaticMinionsAction(game.id, seats))}
                  />
                ) : (
                  <NightActionRow
                    actor={p}
                    spec={actionSpec(effId)}
                    players={game.players}
                    charMap={charMap}
                    record={game.actions.find((a) => a.actorSeat === p.seat && !a.bluff)}
                    busy={busy}
                    gameId={game.id}
                    onRecord={(targets, result) => run(() => recordActionAction(game.id, p.seat, effId, targets, result))}
                    onClear={() => run(() => clearActionAction(game.id, p.seat))}
                    onApplyMarker={onApplyMarker}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
