// 행동 자동 추천 — 순수 모듈(클라이언트/서버 공용).
//
// 그리모어 상태(좌석 링·진영·생사·마커·전역마커)로 "정보 직업이 받을 결과"를 미리 계산해
// 이야기꾼에게 기본값 + 근거 + 이웃 정보를 제시한다. **자동 제출이 아니라 제안**이며 ST가 덮어쓸 수 있다.
//
// 설계 원칙(분석·검증 결과 반영):
//  - 진영은 player.alignment(진실)로 센다. 은둔자(선→악 등록 가능)·첩자(악→선 등록 가능)는 값을 *뒤집지 않고*
//    "범위 + 경고"로만 표시한다. 어느 쪽으로 등록할지는 ST의 선택이라 결정 불가.
//  - 행동 주체가 취함/중독/Vortox(isTainted)면 정보는 거짓이어야 하므로 자동 채움을 하지 않고
//    "진짜값 N — 거짓 줘야 함"으로만 표시한다(이야기꾼이 의식적으로 거짓값을 입력).
//  - turning/gained/became/disguise는 read 시점의 alignment를 바꾸지 않는다(advancePhase에서만 변경). raw로 읽는다.
//  - 좌석 이웃은 x/y(시각 배치)가 아니라 **좌석 번호 링**(0..N-1, 시계방향)으로만 계산한다.

import { isTainted } from "./markers";
import { misregisterOf } from "./night-actions";
import type { Character, GamePlayer, VoteRecord } from "./types";

export type MisregisterKind = "good-as-evil" | "evil-as-good";

/** 행동 주체의 양옆 생존 이웃 1명(공감자 등). */
export type NeighborInfo = {
  player: GamePlayer;
  /** left = 반시계(이전 좌석), right = 시계(다음 좌석). 좌석 번호 순 기준. */
  side: "left" | "right";
  /** 진짜 진영(player.alignment). */
  align: "good" | "evil";
  /** 은둔자/첩자처럼 반대로 등록될 수 있으면 그 종류. */
  misregister?: MisregisterKind;
};

export type ActionSuggestion = {
  /** 추천 결과값 (NightActionRecord.result 인코딩과 동일). 없으면 결과 추천 없음. */
  result?: string;
  /** 사람이 읽는 근거 한 줄. */
  reason?: string;
  /** 은둔자/첩자가 계산 창에 포함될 때 가능한 범위(숫자형 결과). low===high면 생략. */
  range?: { low: number; high: number; note: string };
  /** 범위로 못 좁히는 약한 주의(예: 요리사에 은둔자·첩자가 있어 쌍 수가 달라질 수 있음). */
  note?: string;
  /** 양옆 이웃 컨텍스트(공감자 등). */
  neighbors?: NeighborInfo[];
  /** 행동 주체가 취함/중독/Vortox → 거짓 정보를 줘야 함(자동 채움 금지). */
  tainted?: boolean;
};

export type SuggestContext = {
  /** 운영상 다루는 직업 id(effective). */
  characterId: string;
  actor: GamePlayer;
  players: GamePlayer[];
  /** 직업 → 팀 판정용(시계공 데몬/하수인 등). */
  charMap: Record<string, Character>;
  globalMarkers: string[];
  votes?: VoteRecord[];
  /** 직전 낮 처형 좌석+직업(장의사용). game.lastExecution 그대로. */
  lastExecution?: { seat: number; characterId: string } | null;
  /** 현재 편집 중인 지목 좌석(타겟 의존 직업용). */
  targets: number[];
  isFirstNight?: boolean;
};

/**
 * 좌석 링에서 양옆으로 **가장 가까운 생존 이웃**. 죽은 좌석은 건너뛰고 한 바퀴 래핑한다.
 * left = 반시계(이전 좌석), right = 시계(다음 좌석). 좌석 번호로 정렬해 인덱스를 찾고 modulo로 래핑.
 * (좌석은 0..N-1 연속·시계방향이 보장되지만, seat±1을 직접 쓰지 않고 정렬 인덱스로 도는 게 안전.)
 */
export function livingNeighbors(
  players: GamePlayer[],
  seat: number,
): { left: GamePlayer | null; right: GamePlayer | null } {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const n = ordered.length;
  const i = ordered.findIndex((p) => p.seat === seat);
  if (i === -1 || n <= 1) return { left: null, right: null };
  const walk = (dir: 1 | -1): GamePlayer | null => {
    for (let k = 1; k < n; k++) {
      const c = ordered[(((i + dir * k) % n) + n) % n];
      if (c.status === "alive") return c;
    }
    return null;
  };
  return { left: walk(-1), right: walk(1) };
}

function neighborInfo(p: GamePlayer, side: "left" | "right"): NeighborInfo {
  return { player: p, side, align: p.alignment, misregister: misregisterOf(p.characterId) };
}

const MISREGISTER_NOTE = "은둔자·첩자 등록에 따라 달라질 수 있음";

/** 좌석 링에서 두 좌석 사이 최단 걸음 수(시계/반시계 중 짧은 쪽). 죽은 좌석도 포함한 전체 링. */
function ringDistance(players: GamePlayer[], seatA: number, seatB: number): number | null {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const n = ordered.length;
  const i = ordered.findIndex((p) => p.seat === seatA);
  const j = ordered.findIndex((p) => p.seat === seatB);
  if (i < 0 || j < 0) return null;
  const d = Math.abs(i - j);
  return Math.min(d, n - d);
}

/** 한 집합에서 악 수 + 은둔자(선→악)·첩자(악→선) 등록에 따른 가능 범위. */
function evilCountRange(group: GamePlayer[]): { evil: number; low: number; high: number } {
  const evil = group.filter((p) => p.alignment === "evil").length;
  const recluse = group.filter((p) => misregisterOf(p.characterId) === "good-as-evil").length;
  const spy = group.filter((p) => misregisterOf(p.characterId) === "evil-as-good").length;
  return { evil, low: Math.max(0, evil - spy), high: Math.min(group.length, evil + recluse) };
}

/** 공감자: 양옆 생존 이웃 중 악 수(0~2). 은둔자/첩자는 범위·경고로 표시. */
function suggestEmpath(ctx: SuggestContext): ActionSuggestion {
  const { left, right } = livingNeighbors(ctx.players, ctx.actor.seat);
  const neighbors: NeighborInfo[] = [];
  if (left) neighbors.push(neighborInfo(left, "left"));
  if (right) neighbors.push(neighborInfo(right, "right"));
  const { evil, low, high } = evilCountRange(neighbors.map((nb) => nb.player));
  return {
    result: String(evil),
    reason: `양 옆 생존 이웃 중 악 ${evil}명`,
    range: low !== high ? { low, high, note: MISREGISTER_NOTE } : undefined,
    neighbors,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 요리사: 좌석 링에서 인접한 악-악 쌍 수(원형, 래핑 포함). 첫밤(전원 생존) 기준. */
function suggestChef(ctx: SuggestContext): ActionSuggestion {
  const ordered = [...ctx.players].sort((a, b) => a.seat - b.seat);
  const n = ordered.length;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    if (ordered[i].alignment === "evil" && ordered[(i + 1) % n].alignment === "evil") pairs++;
  }
  // 인접 쌍은 위치 의존이라 정확한 범위 계산 대신, 은둔자·첩자가 있으면 약한 주의만 단다.
  const hasMis = ctx.players.some((p) => misregisterOf(p.characterId));
  return {
    result: String(pairs),
    reason: `인접한 악 쌍 ${pairs}개`,
    note: hasMis ? MISREGISTER_NOTE : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 신탁: 사망자 중 악 수. 은둔자/첩자 등록 범위 표시. */
function suggestOracle(ctx: SuggestContext): ActionSuggestion {
  const dead = ctx.players.filter((p) => p.status === "dead");
  const { evil, low, high } = evilCountRange(dead);
  return {
    result: String(evil),
    reason: `사망자 ${dead.length}명 중 악 ${evil}명`,
    range: low !== high ? { low, high, note: MISREGISTER_NOTE } : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 시계공: 데몬에서 가장 가까운 하수인까지 좌석 거리(시계/반시계 짧은 쪽). 죽은 좌석 포함 전체 링. */
function suggestClockmaker(ctx: SuggestContext): ActionSuggestion | null {
  const teamOf = (p: GamePlayer) => ctx.charMap[p.characterId]?.team;
  const demons = ctx.players.filter((p) => teamOf(p) === "demon");
  const minions = ctx.players.filter((p) => teamOf(p) === "minion");
  if (demons.length === 0 || minions.length === 0) return null;
  let best: number | null = null;
  for (const d of demons) {
    for (const m of minions) {
      const dist = ringDistance(ctx.players, d.seat, m.seat);
      if (dist != null && (best == null || dist < best)) best = dist;
    }
  }
  if (best == null) return null;
  return {
    result: String(best),
    reason: `데몬↔최근접 하수인 ${best}칸`,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 광신도: 현재 본인 진영(이웃에 따라 매일 갱신되며 player.alignment에 이미 반영됨). */
function suggestCultLeader(ctx: SuggestContext): ActionSuggestion {
  return {
    result: ctx.actor.alignment,
    reason: `현재 본인 진영: ${ctx.actor.alignment === "evil" ? "악" : "선"}`,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

const bySeat = (players: GamePlayer[], seat: number): GamePlayer | undefined =>
  players.find((p) => p.seat === seat);
const pickedPlayers = (ctx: SuggestContext): GamePlayer[] =>
  ctx.targets.map((s) => bySeat(ctx.players, s)).filter((p): p is GamePlayer => !!p);

// ── 타겟 의존 직업: targets를 다 고른 뒤에야 결과가 정해진다(자동채움 X, 추천 칩만). ──

/** 점쟁이: 지목 2명 중 데몬 또는 레드헤링(herring)이 있으면 예. 은둔자는 데몬으로 보일 수 있음. */
function suggestFortuneteller(ctx: SuggestContext): ActionSuggestion | null {
  if (ctx.targets.length < 2) return null;
  const picks = pickedPlayers(ctx);
  const hit = picks.some((p) => ctx.charMap[p.characterId]?.team === "demon" || p.markers.includes("herring"));
  const hasRecluse = picks.some((p) => misregisterOf(p.characterId) === "good-as-evil");
  return {
    result: hit ? "yes" : "no",
    reason: hit ? "지목 중 데몬/레드헤링 있음" : "지목 중 데몬 없음",
    note: hasRecluse && !hit ? "은둔자가 데몬으로 보일 수 있음" : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 재봉사: 지목 2명이 같은 진영이면 예. */
function suggestSeamstress(ctx: SuggestContext): ActionSuggestion | null {
  if (ctx.targets.length < 2) return null;
  const [a, b] = pickedPlayers(ctx);
  if (!a || !b) return null;
  const same = a.alignment === b.alignment;
  const hasMis = [a, b].some((p) => misregisterOf(p.characterId));
  return {
    result: same ? "yes" : "no",
    reason: same ? "두 명 같은 진영" : "두 명 다른 진영",
    note: hasMis ? MISREGISTER_NOTE : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 마을백치: 지목한 1명의 진영. (백치 여럿이면 1명은 취함 → 거짓이어야 함.) */
function suggestVillageIdiot(ctx: SuggestContext): ActionSuggestion | null {
  if (ctx.targets.length < 1) return null;
  const t = bySeat(ctx.players, ctx.targets[0]);
  if (!t) return null;
  return {
    result: t.alignment,
    reason: `대상 진영: ${t.alignment === "evil" ? "악" : "선"}`,
    note: misregisterOf(t.characterId) ? MISREGISTER_NOTE : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 공작부인: 세 방문자 중 악 수(한 명에겐 거짓을 주지만 진짜 수를 제시). */
function suggestDuchess(ctx: SuggestContext): ActionSuggestion | null {
  if (ctx.targets.length < 1) return null;
  const picks = pickedPlayers(ctx);
  const { evil, low, high } = evilCountRange(picks);
  return {
    result: String(evil),
    reason: `방문자 ${picks.length}명 중 악 ${evil}명`,
    range: low !== high ? { low, high, note: MISREGISTER_NOTE } : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

// ── 직업(role) 결과: 지목 대상의 직업을 그대로 추천. 토큰 모달에서 직접 고르는 수고를 던다. ──
// disguise(주정뱅이·꼭두각시)는 본인이 다른 직업이라 믿을 뿐 *진짜 직업*은 좌석 그대로이므로 characterId를
// 쓴다(까마귀지기는 진짜 토큰을 알려줌). became/gained(별넘김·철학자 등 드문 정체 변경)는 ST가 칩을 덮어쓰면 됨.

const TEAM_KO: Record<string, string> = { townsfolk: "주민", outsider: "외지인", minion: "하수인", demon: "데몬" };

/** 대상 1명의 진짜 직업을 결과로(까마귀지기·탕녀·기구조종사). */
function suggestTargetRole(ctx: SuggestContext): ActionSuggestion | null {
  if (ctx.targets.length < 1) return null;
  const t = bySeat(ctx.players, ctx.targets[0]);
  if (!t) return null;
  return {
    result: t.characterId,
    reason: "대상의 직업",
    note: misregisterOf(t.characterId) ? "은둔자·첩자는 다른 직업으로 보일 수 있음" : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 지목 중 특정 팀(주민/외지인/하수인)인 좌석의 직업을 결과로(세탁부·사서·수사관). */
function suggestTypedTargetRole(ctx: SuggestContext, team: string): ActionSuggestion | null {
  if (ctx.targets.length < 1) return null;
  const match = pickedPlayers(ctx).find((p) => ctx.charMap[p.characterId]?.team === team);
  if (!match) return null;
  return {
    result: match.characterId,
    reason: `지목 중 ${TEAM_KO[team] ?? team}의 직업`,
    note: misregisterOf(match.characterId) ? "은둔자·첩자는 다른 직업으로 보일 수 있음" : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/** 장의사: 직전 낮에 처형된 사람의 직업(targets=0 → 편집기 열면 자동 채움). 처형 없으면 추천 없음(깨우지 않음). */
function suggestUndertaker(ctx: SuggestContext): ActionSuggestion | null {
  const ex = ctx.lastExecution;
  if (!ex) return null;
  const t = bySeat(ctx.players, ex.seat);
  return {
    result: ex.characterId,
    reason: `어제 처형: ${t?.nickname ?? `좌석 ${ex.seat}`}`,
    note: t && misregisterOf(t.characterId) ? "은둔자·첩자는 다른 직업으로 보일 수 있음" : undefined,
    tainted: isTainted(ctx.actor.markers, ctx.globalMarkers),
  };
}

/**
 * 그리모어 상태 기반 행동 결과 추천. 등재된 직업만 계산하고, 그 외엔 null(추천 없음).
 * 직업을 하나씩 추가하며 고도화한다.
 */
export function suggestAction(ctx: SuggestContext): ActionSuggestion | null {
  switch (ctx.characterId) {
    case "empath":
      return suggestEmpath(ctx);
    case "chef":
      return suggestChef(ctx);
    case "oracle":
      return suggestOracle(ctx);
    case "clockmaker":
      return suggestClockmaker(ctx);
    case "cultleader":
      return suggestCultLeader(ctx);
    case "fortuneteller":
      return suggestFortuneteller(ctx);
    case "seamstress":
      return suggestSeamstress(ctx);
    case "villageidiot":
      return suggestVillageIdiot(ctx);
    case "duchess":
      return suggestDuchess(ctx);
    case "ravenkeeper":
    case "harlot":
    case "balloonist":
      return suggestTargetRole(ctx);
    case "washerwoman":
      return suggestTypedTargetRole(ctx, "townsfolk");
    case "librarian":
      return suggestTypedTargetRole(ctx, "outsider");
    case "investigator":
      return suggestTypedTargetRole(ctx, "minion");
    case "undertaker":
      return suggestUndertaker(ctx);
    default:
      return null;
  }
}
