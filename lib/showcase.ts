// 보여주기(showcase) 해석 — 단일 출처. 순수 모듈(DB 의존 없음, Game 스냅샷 in → 표시 payload out).
//
// LAN 보여주기 페이지(app/play/[gameId]/show/[seat])와 온라인 밤 행동 push가 *같은 규칙*으로
// "무엇을 드러낼지"를 계산하도록 여기로 모은다. show 페이지의 분기 로직(표준 + 특수 모드)을 그대로
// 옮겨, 두 경로가 갈라지지 않게 한다(정보 사고 방지). 렌더는 components/ShowcasePayloadView가 담당.
//
// 보안: 이 payload는 *능력이 정당하게 드러내는 것*만 담는다. 이름만 보여주는 슬롯(점쟁이·귀족 등)은
// 닉네임만, 정체를 드러내는 슬롯(target/targets)만 characterId를 실어 다른 좌석 직업이 새지 않는다.
// (좌석 redaction과 동일한 자기완결 모델.)

import type { Game, Team } from "./types";
import type { ResultKind, ShowcaseSpec } from "./night-actions";
import { pickShowcase, showsWithoutRecord, specForPhase } from "./night-actions";
import { seatsShownAsDemons, seatsShownAsMinions } from "./roles";

/** 보여주기에 필요한 최소 스펙(ShowcaseView가 읽는 필드만). */
export type ShowcaseSpecLite = { targets: number; result: ResultKind; hint?: string };

/**
 * 플레이어 폰에 표시할 자기완결 보여주기 데이터.
 * - standard  : 표준 행동 결과(ShowcaseView로 렌더). recipientSeat=이 화면을 받을 좌석(라우팅용).
 * - roleTokens: 큰 직업 토큰 나열(악마 블러핑).
 * - nameTokens: 큰 닉네임 카드 나열(하수인/악마 정보·미치광이 가짜 공격 등 정체 비노출).
 */
export type ShowcasePayload =
  | {
      kind: "standard";
      /** 이 보여주기를 받을 좌석(recipient=none이면 null → 호출측이 지정). 렌더에는 안 씀. */
      recipientSeat: number | null;
      actorNickname: string;
      /** actor/actorName 슬롯이 있을 때만 채움(그 외엔 액터 정체 비노출). */
      actorCharacterId: string | null;
      targets: { nickname: string; characterId: string | null }[];
      resultStr: string;
      spec: ShowcaseSpecLite;
      showcase: ShowcaseSpec | null;
      hasRecord: boolean;
      emptyAllowed: boolean;
    }
  | {
      kind: "roleTokens";
      forNickname: string | null;
      heading: string;
      roleTokens: string[];
      emptyText: string;
    }
  | {
      kind: "nameTokens";
      forNickname: string | null;
      heading: string;
      subheading?: string;
      nameTokens: string[];
      emptyText: string;
    }
  | {
      // 첫밤 정보 한 화면(수신자 1회 기상) — 여러 섹션(동료 하수인/악마/블러핑)을 함께 보여준다.
      kind: "firstNightInfo";
      forNickname: string;
      sections: { label: string; kind: "names" | "roles"; items: string[] }[];
      emptyText: string;
    }
  | {
      // 마도서(그리모어) 전체 — 첩자·과부 등이 모든 좌석의 실제 직업/진영/마커/생사를 본다.
      // 이야기꾼 캔버스와 같은 원형 배치로 렌더하도록 좌표(x,y)를 함께 싣는다.
      // recipientSeat=받을 좌석(라우팅용). seats에 전체 좌석의 정체가 담기므로 *받는 좌석만* 내려가야 한다(seat 게이팅).
      kind: "grimoire";
      forNickname: string;
      recipientSeat: number | null;
      seats: {
        seat: number;
        nickname: string;
        characterId: string;
        alignment: string;
        alive: boolean;
        markers: string[];
        x: number;
        y: number;
        deathCause: string;
      }[];
      emptyText: string;
    }
  | {
      // 자유 텍스트 정보 — 이야기꾼이 사반트·어부처럼 구조화되지 않은 사적 정보를 특정 좌석 폰에 직접 보낸다.
      // resolveShowcase가 만들지 않고(구조 없음) ST가 pushTextInfoAction으로 직접 구성. recipientSeat=받을 좌석.
      kind: "text";
      forNickname: string;
      recipientSeat: number | null;
      heading: string;
      body: string;
    };

export type ResolveShowcaseOpts = {
  /** 행동 노드 직업 핀(같은 좌석의 가짜/획득 직업 구분). 없으면 disguise→실제 폴백. */
  as?: string;
  /** 배열 showcase 변형 인덱스(마술사·미치광이). */
  variant?: number;
  /** 특수 모드(bluffs/minions/demon/lunatic-*). */
  mode?: string;
};

const nickOf = (game: Game, seat: number) =>
  game.players.find((p) => p.seat === seat)?.nickname ?? `${seat + 1}번`;

/**
 * seat 좌석의 보여주기 payload를 계산한다. show 페이지와 동일한 분기.
 * getTeam: characterId → 진영(특수 모드의 악마/하수인 좌석 계산용).
 */
export function resolveShowcase(
  game: Game,
  seat: number,
  opts: ResolveShowcaseOpts,
  getTeam: (characterId: string) => Team | undefined,
): ShowcasePayload | null {
  const actor = game.players.find((p) => p.seat === seat);
  if (!actor) return null;
  const { as, variant = 0, mode } = opts;
  const effId = as || game.disguises?.[seat] || actor.characterId;

  // ─── 특수 모드: 마도서(그리모어) 전체 — 첩자·과부. 받는 좌석(actor)만 내려간다. ───
  if (mode === "grimoire") {
    return {
      kind: "grimoire",
      forNickname: actor.nickname,
      recipientSeat: seat,
      seats: game.players
        .slice()
        .sort((a, b) => a.seat - b.seat)
        .map((p) => ({
          seat: p.seat,
          nickname: p.nickname,
          characterId: p.characterId,
          alignment: p.alignment,
          alive: p.status !== "dead",
          markers: p.markers,
          x: p.x,
          y: p.y,
          deathCause: p.deathCause,
        })),
      emptyText: "표시할 좌석이 없습니다.",
    };
  }

  // ─── 특수 모드: 미치광이 가짜 공격 지목을 진짜 악마에게 ───
  if (mode === "lunatic-choice") {
    const record = game.actions.find((a) => a.actorSeat === seat && a.characterId === effId && !a.bluff);
    return {
      kind: "nameTokens",
      forNickname: null,
      heading: "미치광이가 지목한 가짜 공격 대상입니다",
      subheading: "미치광이(가짜 악마)의 선택입니다 — 실제로 따를지는 당신이 결정합니다",
      nameTokens: (record?.targets ?? []).map((s) => nickOf(game, s)),
      emptyText: "아직 지목이 기록되지 않았습니다.",
    };
  }

  // ─── 특수 모드: 하수인에게 "악마가 누구인지" ───
  if (mode === "demon") {
    const names = seatsShownAsDemons(game.players, getTeam).map((s) => nickOf(game, s));
    return {
      kind: "nameTokens",
      forNickname: null,
      heading: names.length > 1 ? "이들이 악마입니다" : "이 사람이 악마입니다",
      nameTokens: names,
      emptyText: "악마가 지정되지 않았습니다.",
    };
  }

  // ─── 첫밤 정보(합본): 하수인 1명이 받는 화면 = 동료 하수인 + 악마 ───
  if (mode === "minion-info") {
    // 받는 본인(seat)은 '동료 하수인'에서 제외 — 자기 자신을 동료로 표시하던 문제 방지.
    const minions = seatsShownAsMinions(game.players, getTeam, { excludeSeat: seat }).map((s) => nickOf(game, s));
    const demons = seatsShownAsDemons(game.players, getTeam).map((s) => nickOf(game, s));
    const sections: { label: string; kind: "names" | "roles"; items: string[] }[] = [];
    if (minions.length) sections.push({ label: "동료 하수인", kind: "names", items: minions });
    if (demons.length) sections.push({ label: "악마", kind: "names", items: demons });
    return { kind: "firstNightInfo", forNickname: actor.nickname, sections, emptyText: "알려줄 정보가 없습니다." };
  }

  // ─── 첫밤 정보(합본): 악마가 받는 화면 = 하수인 + 블러핑 3개 ───
  if (mode === "demon-info") {
    const minions = seatsShownAsMinions(game.players, getTeam).map((s) => nickOf(game, s));
    const sections: { label: string; kind: "names" | "roles"; items: string[] }[] = [];
    if (minions.length) sections.push({ label: "하수인", kind: "names", items: minions });
    if (game.bluffs.length) sections.push({ label: "블러핑 (내가 아닌 직업)", kind: "roles", items: game.bluffs });
    return { kind: "firstNightInfo", forNickname: actor.nickname, sections, emptyText: "알려줄 정보가 없습니다." };
  }

  // ─── 특수 모드: 악마/미치광이 첫밤 정보(블러핑 / 하수인) ───
  const isBluffs = mode === "bluffs" || mode === "lunatic-bluffs";
  const isMinions = mode === "minions" || mode === "lunatic-minions";
  const isLunaticMode = mode === "lunatic-bluffs" || mode === "lunatic-minions";
  if (isBluffs) {
    const ids = isLunaticMode ? game.lunaticBluffs : game.bluffs;
    return {
      kind: "roleTokens",
      forNickname: actor.nickname,
      heading: "당신의 블러핑 직업입니다",
      roleTokens: ids,
      emptyText: "블러핑이 아직 선택되지 않았습니다.",
    };
  }
  if (isMinions) {
    const seats = isLunaticMode
      ? game.lunaticMinions
      : seatsShownAsMinions(game.players, getTeam);
    return {
      kind: "nameTokens",
      forNickname: actor.nickname,
      heading: "이들은 하수인입니다",
      nameTokens: seats.map((s) => nickOf(game, s)),
      emptyText: "하수인이 지정되지 않았습니다.",
    };
  }

  // ─── 표준 보여주기: 행동 기록(record) 기반 ───
  const spec = specForPhase(effId, game.phase ?? "night", game.day);
  const showcase = pickShowcase(spec, variant) ?? null;
  const record = game.actions.find((a) => a.actorSeat === seat && a.characterId === effId && !a.bluff);
  const rTargets = record?.targets ?? [];

  // 정체를 드러내는 토큰 슬롯이 가리키는 target 인덱스만 characterId를 싣는다(그 외엔 닉네임만).
  const tokens = showcase?.tokens ?? [];
  const reveal = new Set<number>();
  if (tokens.includes("targets")) rTargets.forEach((_, i) => reveal.add(i));
  if (tokens.includes("target")) reveal.add(0);
  if (tokens.includes("target2")) reveal.add(1);

  const targets = rTargets.map((s, i) => {
    const p = game.players.find((pp) => pp.seat === s);
    return {
      nickname: p?.nickname ?? `${s + 1}번`,
      characterId: reveal.has(i) ? (p?.characterId ?? null) : null,
    };
  });

  const revealsActor = tokens.includes("actor") || tokens.includes("actorName");

  // 받는 사람 좌석 라우팅: actor=본인, target=첫 지목, none=호출측이 지정(null).
  let recipientSeat: number | null = seat;
  if (showcase?.recipient === "target") recipientSeat = rTargets[0] ?? null;
  else if (showcase?.recipient === "none") recipientSeat = null;

  return {
    kind: "standard",
    recipientSeat,
    actorNickname: actor.nickname,
    actorCharacterId: revealsActor ? effId : null,
    targets,
    resultStr: record?.result ?? "",
    spec: { targets: spec.targets, result: spec.result, hint: spec.hint },
    showcase,
    hasRecord: !!record,
    emptyAllowed: showsWithoutRecord(actor.characterId),
  };
}

/**
 * 기록 목록(NightHistoryList)용 한 줄 요약 — 전달된 payload를 heading + 토큰 칩으로 압축.
 * getRoleName: 직업 id → 이름(role 결과·정체노출 슬롯 칩 라벨용).
 * (heading 치환 규칙은 ShowcaseView.fill과 동일 — 목록에선 charMap 없이 값만 채운다.)
 */
export function showcaseSummary(
  p: ShowcasePayload,
  getRoleName: (id: string) => string,
): { heading: string; subheading?: string; roleTokens: string[]; nameTokens: string[] } {
  if (p.kind === "roleTokens") return { heading: p.heading, roleTokens: p.roleTokens, nameTokens: [] };
  if (p.kind === "nameTokens")
    return { heading: p.heading, subheading: p.subheading, roleTokens: [], nameTokens: p.nameTokens };
  if (p.kind === "firstNightInfo")
    return {
      heading: p.sections.map((s) => s.label).join(" · ") || "첫밤 정보",
      roleTokens: p.sections.filter((s) => s.kind === "roles").flatMap((s) => s.items),
      nameTokens: p.sections.filter((s) => s.kind === "names").flatMap((s) => s.items),
    };
  if (p.kind === "grimoire")
    return { heading: "마도서(그리모어) 확인", subheading: `${p.seats.length}개 좌석`, roleTokens: [], nameTokens: [] };
  if (p.kind === "text")
    return { heading: p.heading || "이야기꾼 정보", subheading: p.body, roleTokens: [], nameTokens: [] };

  // 레거시 페이로드(구 InfoPayload {heading, roleTokens, nameTokens}, kind 없음) 방어.
  const legacy = p as unknown as {
    kind?: string;
    heading?: string;
    subheading?: string;
    roleTokens?: string[];
    nameTokens?: string[];
  };
  if (legacy.kind !== "standard") {
    return {
      heading: legacy.heading ?? "정보",
      subheading: legacy.subheading,
      roleTokens: legacy.roleTokens ?? [],
      nameTokens: legacy.nameTokens ?? [],
    };
  }

  const names = p.targets.map((t) => t.nickname);
  const yn = p.resultStr === "yes" ? "예" : p.resultStr === "no" ? "아니오" : "—";
  const team = p.resultStr === "good" ? "선" : p.resultStr === "evil" ? "악" : "—";
  const roleName = p.spec.result === "role" && p.resultStr ? getRoleName(p.resultStr) : "—";
  const fill = (tpl?: string) =>
    (tpl ?? "")
      .replace(/\{role\}/g, roleName)
      .replace(/\{actor\}/g, p.actorNickname)
      .replace(/\{targets\}/g, names.join(", ") || "—")
      .replace(/\{target2\}/g, names[1] ?? "—")
      .replace(/\{target\}/g, names[0] ?? "—")
      .replace(/\{count\}/g, p.resultStr || "—")
      .replace(/\{yn\}/g, yn)
      .replace(/\{team\}/g, team)
      .replace(/\{result\}/g, p.resultStr || "—");

  const roleTokens = p.spec.result === "role" && p.resultStr ? [p.resultStr] : [];
  for (const t of p.targets) if (t.characterId && !roleTokens.includes(t.characterId)) roleTokens.push(t.characterId);

  return {
    heading: p.showcase?.heading ? fill(p.showcase.heading) : p.resultStr || "행동 결과",
    subheading: p.showcase?.subheading ? fill(p.showcase.subheading) : undefined,
    roleTokens,
    nameTokens: names,
  };
}
