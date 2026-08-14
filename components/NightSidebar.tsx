"use client";

import { useRef } from "react";
import { TEAM_MAP } from "@/lib/constants";
import { effectiveCharacterId, parseMarker } from "@/lib/markers";
import { actionCriteria, actionSpec, isAbilityUsedUp, nightActionSpec } from "@/lib/night-actions";
import { nightInfoNode } from "@/lib/night-info";
import { TaintWarning } from "./TaintWarning";
import { ActionCardHeader, type HeaderTag } from "./ActionCardHeader";
import type { Character, Game, GameActionRun, NightAction } from "@/lib/types";
import { NightActionRow, type OnlineNightCtx } from "./NightActionRow";
import { LunaticActionRow } from "./LunaticActionRow";
import { RequestStatusBadge } from "./RequestStatusBadge";
import {
  clearActionAction,
  recordActionAction,
  setHerringAction,
  setLunaticBluffsAction,
  setLunaticMinionsAction,
  toggleDoneAction,
} from "@/app/play/actions";
import { RedHerringPicker } from "./RedHerringPicker";

type Run = GameActionRun;

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
  online,
}: {
  game: Game;
  charMap: Record<string, Character>;
  sheetChars: Character[];
  isFirstNight: boolean;
  busy: boolean;
  run: Run;
  onApplyMarker: (seats: number[], markerStr: string) => void;
  onClose: () => void;
  /** 온라인이면 보여주기가 플레이어 폰으로 push된다(LAN이면 undefined). */
  online?: OnlineNightCtx;
}) {
  // 좌석마다 실제 운영상 어떤 직업으로 다루는지(disguise / gained / became 마커 반영).
  // 미치광이는 데몬처럼, 식인종은 처형된 town 능력처럼, 임프 자살자는 새 직업으로 노출.
  const roles: RoleItem[] = game.players.flatMap((p) => {
    const effId = effectiveCharacterId(p.seat, p.characterId, p.markers, game.disguises);
    const nightOf = (id: string) =>
      (isFirstNight ? charMap[id]?.firstNight : charMap[id]?.otherNight) as NightAction;
    // 미치광이: 가짜 악마가 지정돼도 공식 룰상 *미치광이 자체 순서*로 깨운다(진짜 악마보다
    // 먼저). 가짜 악마의 order 노드는 만들지 않고, 노드 하나에 가짜 행동 기록까지 합친다.
    if (p.characterId === "lunatic") {
      const na = nightOf("lunatic");
      return na ? [{ kind: "role" as const, order: na.order, p, effId: "lunatic", na }] : [];
    }
    const out: RoleItem[] = [];
    const na = nightOf(effId);
    if (na) out.push({ kind: "role", order: na.order, p, effId, na });
    // 본체 노드도 별도로 필요한 경우:
    //  - disguise 좌석(꼭두각시 등): 가짜 직업이 행동 순서를 대체해도 본체 운영(꼭두각시 보여주기) 필요.
    //  - gained 마커(철학자 등): 획득 직업으로 행동하지만 본인의 '능력 획득' 보여주기도 필요.
    //  became(임프 자살 등)은 직업이 *완전히* 바뀐 것이라 본체 노드 불필요 → 제외.
    const fromGained = p.markers.some((m) => parseMarker(m).base === "gained");
    if (effId !== p.characterId && (game.disguises?.[p.seat] != null || fromGained)) {
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
    if (hasMinion) items.push({ kind: "info", order: nightInfoNode("minion").order, infoKind: "minion" });
    if (hasDemon) items.push({ kind: "info", order: nightInfoNode("demon").order, infoKind: "demon" });
  }
  items.sort((a, b) => a.order - b.order);

  // ── 밤 순서 반자동 진행 ── 현재 순번(첫 미완료 노드)을 하이라이트하고 '현재로' 점프를 제공한다.
  // 완전 자동이 아니라 ST가 언제든 다른 노드를 처리·오버라이드할 수 있는 반자동(진행도 표시 + 포커스 보조).
  const isDone = (item: RoleItem | InfoItem): boolean => {
    if (item.kind === "role") return game.doneSeats.includes(item.p.seat);
    if (!online) return true; // LAN 정보 노드는 완료 추적이 없어 스텝퍼에서 건너뜀.
    const targets =
      item.infoKind === "minion"
        ? game.players.filter((x) => charMap[x.characterId]?.team === "minion" && x.characterId !== "marionette")
        : game.players.filter((x) => charMap[x.characterId]?.team === "demon");
    return (
      targets.length > 0 &&
      targets.every((t) => {
        const r = online.requestBySeat.get(t.seat);
        return !!r && (r.status === "delivered" || r.status === "done");
      })
    );
  };
  const doneFlags = items.map(isDone);
  const currentIndex = doneFlags.findIndex((d) => !d); // -1 = 전부 완료
  const doneCount = doneFlags.filter(Boolean).length;
  const currentRef = useRef<HTMLLIElement | null>(null);
  const scrollToCurrent = () => currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <aside className="flex w-full shrink-0 flex-col md:h-[70vh] md:w-72 md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">
          {isFirstNight ? "첫째 밤" : "그 외 밤"} 행동 순서
          <span className="ml-1 font-normal text-muted">· {doneCount}/{items.length}</span>
        </span>
        <div className="flex items-center gap-1">
          {currentIndex >= 0 && (
            <button
              type="button"
              onClick={scrollToCurrent}
              title="지금 진행할 순번(첫 미완료)으로 이동"
              className="rounded px-1.5 py-0.5 text-xs font-semibold text-gold hover:bg-gold/15"
            >
              현재 순번
            </button>
          )}
          <button type="button" onClick={onClose} title="닫기" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">이 밤에 행동하는 직업이 없습니다.</p>
      ) : (
        <ol className="divide-y divide-border md:flex-1 md:overflow-y-auto">
          {items.map((item, i) => {
            if (item.kind === "info") {
              const isMinion = item.infoKind === "minion";
              const node = nightInfoNode(item.infoKind);
              // 하수인 정보: 단체 화면 한 번 — 하수인 전원이 함께 깨어나 받으므로 링크 1개.
              //   carrier 좌석은 라우트용일 뿐(화면은 데몬을 전역에서 계산). 아무 하수인 좌석.
              const minionInfoSeat = game.players.find(
                (x) => charMap[x.characterId]?.team === "minion",
              )?.seat;
              // 악마 정보: 각 데몬 폰에 블러핑 3개 + 하수인이 누구인지 보여주기.
              const demonSeats = game.players.filter((x) => charMap[x.characterId]?.team === "demon");
              return (
                <li
                  key={`info-${item.infoKind}`}
                  ref={i === currentIndex ? currentRef : undefined}
                  className={`bg-surface-2/40 px-3 py-2 ${i === currentIndex ? "ring-2 ring-inset ring-gold/60" : ""}`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-4 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={node.icon} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                    <span className="font-semibold" style={{ color: "#d23b3b" }}>
                      {node.label}
                    </span>
                    <span className="text-xs text-muted">단계</span>
                  </div>
                  <p className="mt-1 break-words pl-6 text-xs text-muted">{node.reminder}</p>
                  <div className="mt-1.5 flex flex-col gap-1.5 pl-6">
                    {isMinion ? (
                      online ? (
                        // 온라인: 각 하수인 폰에 '동료 하수인 + 악마'를 한 화면으로 push(1회 기상).
                        game.players
                          .filter((x) => charMap[x.characterId]?.team === "minion" && x.characterId !== "marionette")
                          .map((m) => (
                            <div key={m.seat} className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="text-muted">{m.nickname}</span>
                              <button
                                type="button"
                                disabled={online.busy}
                                onClick={() => online.pushShowcase(m.seat, m.characterId, { mode: "minion-info", toSeat: m.seat })}
                                className="rounded bg-gold/15 px-2 py-0.5 text-gold hover:bg-gold/25 disabled:opacity-50"
                              >
                                {online.requestBySeat.get(m.seat) ? "다시 보내기" : "정보 보내기"}
                              </button>
                              <RequestStatusBadge req={online.requestBySeat.get(m.seat)} offline={online.presence?.[m.seat] === false} />
                            </div>
                          ))
                      ) : (
                        minionInfoSeat != null && (
                          <a
                            href={`/play/${game.id}/show/${minionInfoSeat}?mode=demon`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-fit items-center gap-1 rounded bg-gold/15 px-1.5 py-0.5 text-xs text-gold hover:bg-gold/25"
                          >
                            보여주기
                          </a>
                        )
                      )
                    ) : online ? (
                      // 온라인: 각 악마 폰에 '하수인 + 블러핑'을 한 화면으로 push.
                      demonSeats.map((d) => (
                        <div key={d.seat} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-muted">{d.nickname}</span>
                          <button
                            type="button"
                            disabled={online.busy}
                            onClick={() => online.pushShowcase(d.seat, d.characterId, { mode: "demon-info", toSeat: d.seat })}
                            className="rounded bg-gold/15 px-2 py-0.5 text-gold hover:bg-gold/25 disabled:opacity-50"
                          >
                            {online.requestBySeat.get(d.seat) ? "다시 보내기" : "정보 보내기"}
                          </button>
                          <RequestStatusBadge req={online.requestBySeat.get(d.seat)} offline={online.presence?.[d.seat] === false} />
                        </div>
                      ))
                    ) : (
                      demonSeats.map((d) => (
                        <span key={d.seat} className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-surface px-1.5 py-0.5 text-xs">
                          <span className="text-muted">{d.nickname}</span>
                          <a href={`/play/${game.id}/show/${d.seat}?mode=bluffs`} target="_blank" rel="noopener noreferrer" className="rounded bg-gold/15 px-1.5 py-0.5 text-gold hover:bg-gold/25">블러핑</a>
                          <a href={`/play/${game.id}/show/${d.seat}?mode=minions`} target="_blank" rel="noopener noreferrer" className="rounded bg-gold/15 px-1.5 py-0.5 text-gold hover:bg-gold/25">하수인</a>
                        </span>
                      ))
                    )}
                  </div>
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
            const rowSpec = nightActionSpec(effId, isFirstNight);
            // 일회성 사용 여부는 'noability:<직업>' 영구 마커로 판정(직업별) → 다음 페이즈에도 "능력 사용함" 유지.
            // 한 좌석에 여러 일회성 능력(철학자+획득직업 등)이 있어도 해당 직업 마커만 본다. 구버전 bare 'noability'도 호환.
            const usedOnce = isAbilityUsedUp(rowSpec.oncePerGame, effId, p.markers);
            // 사망 시 발동(까마귀지기): 죽었고 아직 미사용이면 "발동 대기"라 흐리지 않는다.
            const armed = !!rowSpec.deathTriggered && dead && !usedOnce;
            // 능력 사용함 = 사망처럼 흐리게 + 자동 ✓. 사망 자체는 흐리지 않는다(사망 시 발동 능력 때문).
            const checked = done || usedOnce;
            // 사망 예정(악마 지목 등) — 스냅샷상 아직 생존. 보통 능력 건너뜀, 단 사망 시 발동 능력은 오히려 처리.
            // 폰 운영 시 캔버스를 못 봐 놓치기 쉬워 카드에 태그로 표면화한다.
            const dyingPending = !dead && p.markers.includes("dying");
            const headerTags: HeaderTag[] = [];
            if (realCh) headerTags.push({ key: "real", label: `←${realCh.name.ko}`, title: `실제 직업: ${realCh.name.ko}`, tone: "purple" });
            if (fakeCh) headerTags.push({ key: "fake", label: `→${fakeCh.name.ko}`, title: `가짜 직업: ${fakeCh.name.ko}`, tone: "purple" });
            if (dyingPending)
              headerTags.push(
                rowSpec.deathTriggered
                  ? { key: "dying", label: "사망예정 · 능력 발동", title: "오늘 밤 사망 예정 — 사망 시 발동하는 능력이니 지금 처리하세요", tone: "amber" }
                  : { key: "dying", label: "사망예정 · 건너뜀", title: "오늘 밤 사망 예정 — 죽은 것으로 보고 능력 사용을 건너뛰세요", tone: "red" },
              );
            if (dead)
              headerTags.push(
                armed
                  ? { key: "dead", label: "사망 · 능력 발동", title: "사망 시 발동하는 능력 — 지금 처리하세요", tone: "amber" }
                  : { key: "dead", label: "사망", title: "사망", tone: "red" },
              );
            if (usedOnce) headerTags.push({ key: "used", label: "능력 사용함", title: "일회성 능력 — 사용 완료(부활 능력으로 되살아나지 않는 한)", tone: "muted" });
            return (
              <li
                key={`${p.seat}-${effId}`}
                ref={i === currentIndex ? currentRef : undefined}
                className={`px-3 py-2 ${checked ? "opacity-55" : ""} ${i === currentIndex ? "ring-2 ring-inset ring-gold/60 bg-gold/5" : ""}`}
              >
                <ActionCardHeader
                  index={i + 1}
                  image={ch?.image}
                  overlay={realCh?.image ? { image: realCh.image, title: `원래 직업: ${realCh.name.ko}` } : undefined}
                  nickname={p.nickname}
                  roleName={ch?.name.ko ?? effId}
                  roleColor={ch ? TEAM_MAP[ch.team]?.color : undefined}
                  checked={checked}
                  done={done}
                  onToggleDone={() => run(() => toggleDoneAction(game.id, p.seat))}
                  tags={headerTags}
                  taint={<TaintWarning markers={p.markers} globalMarkers={game.globalMarkers} resultKind={rowSpec.result} info={rowSpec.info} />}
                />
                {na.reminder?.ko && <p className="mt-1 whitespace-pre-line break-words pl-6 text-xs text-muted">{na.reminder.ko}</p>}
                {actionCriteria(effId) && (
                  <p className="mt-1 ml-6 break-words rounded border-l-2 border-sky-500/40 bg-sky-500/5 px-2 py-1 text-[11px] leading-relaxed text-sky-200/85">
                    <span className="font-semibold text-sky-300">기준 </span>
                    {actionCriteria(effId)}
                  </p>
                )}
                {effId === "lunatic" ? (
                  <>
                    <LunaticActionRow
                      gameId={game.id}
                      game={game}
                      actorSeat={p.seat}
                      sheetChars={sheetChars}
                      charMap={charMap}
                      busy={busy}
                      readOnly={!isFirstNight}
                      onSetBluffs={(ids) => run(() => setLunaticBluffsAction(game.id, ids))}
                      onSetMinions={(seats) => run(() => setLunaticMinionsAction(game.id, seats))}
                    />
                    {!isFirstNight && fakeId && fakeId !== p.characterId && (
                      // 가짜 악마 공격 흉내 기록 — 미치광이 차례에 함께 처리.
                      // marker는 제거: 미치광이의 선택은 실제로 아무도 죽이지 않는다.
                      // showcase: 기록한 지목을 진짜 데몬에게 보여주는 lunatic-choice 모드.
                      <NightActionRow
                        actor={p}
                        spec={{
                          ...actionSpec(fakeId),
                          marker: undefined,
                          showcase: { mode: "lunatic-choice", recipient: "none" },
                          showcaseLabels: undefined,
                        }}
                        characterId={fakeId}
                        players={game.players}
                        charMap={charMap}
                        record={game.actions.find((a) => a.actorSeat === p.seat && a.characterId === fakeId && !a.bluff)}
                        busy={busy}
                        gameId={game.id}
                        onRecord={(targets, result) => run(() => recordActionAction(game.id, p.seat, fakeId, targets, result))}
                        onClear={() => run(() => clearActionAction(game.id, p.seat, fakeId))}
                        onApplyMarker={onApplyMarker}
                        online={online}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <NightActionRow
                      actor={p}
                      spec={nightActionSpec(effId, isFirstNight)}
                      characterId={effId}
                      players={game.players}
                      charMap={charMap}
                      record={game.actions.find((a) => a.actorSeat === p.seat && a.characterId === effId && !a.bluff)}
                      busy={busy}
                      gameId={game.id}
                      onRecord={(targets, result) => run(() => recordActionAction(game.id, p.seat, effId, targets, result))}
                      onClear={() => run(() => clearActionAction(game.id, p.seat, effId))}
                      onApplyMarker={onApplyMarker}
                      suggest
                      globalMarkers={game.globalMarkers}
                      votes={game.votes}
                      lastExecution={game.lastExecution}
                      isFirstNight={isFirstNight}
                      online={online}
                    />
                    {/* 점쟁이 첫밤: 레드헤링(데몬으로 보일 선한 1명) 지정 편의 — 깜빡하지 않게 카드에서 바로. */}
                    {effId === "fortuneteller" && isFirstNight && (
                      <RedHerringPicker
                        game={game}
                        busy={busy}
                        onAssign={(seat) => run(() => setHerringAction(game.id, seat))}
                        className="mt-1.5 ml-6"
                      />
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
