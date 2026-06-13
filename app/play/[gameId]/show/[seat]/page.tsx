import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/lib/games";
import { charactersForSheet, getCharacter, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { specForPhase, type ShowcaseSpec, type ShowcaseToken } from "@/lib/night-actions";
import { TEAM_MAP } from "@/lib/constants";
import type { Character } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "결과 보이기" };

const YN_LABEL = { yes: "예", no: "아니오" } as const;
const TEAM_LABEL = { good: "선", evil: "악" } as const;

function RoleTokenBig({ ch, label }: { ch?: Character; label?: string }) {
  const color = ch ? TEAM_MAP[ch.team]?.color : "#888";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 bg-surface"
        style={{ borderColor: color }}
      >
        {ch?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ch.image} alt={ch.name.ko} className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl" style={{ color }}>{ch?.name.en.charAt(0) ?? "?"}</span>
        )}
      </div>
      {(ch || label) && (
        <p className="text-base font-semibold" style={{ color }}>{ch?.name.ko ?? label}</p>
      )}
    </div>
  );
}

function NameOnlyBig({ nickname }: { nickname: string }) {
  return (
    <div className="rounded-2xl border-2 border-gold/40 bg-gold/5 px-6 py-4">
      <p className="text-3xl font-bold tracking-wide text-text">{nickname}</p>
    </div>
  );
}

/**
 * 행동 결과 풀스크린 페이지 — ST가 폰/화면을 들이밀어 *받는 사람*에게 정보를 전달.
 * 액터 정체는 절대 노출 안 함(룰: 정보 직업의 정체는 받는 사람에게 비밀).
 * spec.showcase 배열이면 ?v=N으로 변형 선택(마술사: 악마용/하수인용).
 */
export default async function ShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string; seat: string }>;
  searchParams: Promise<{ v?: string; mode?: string }>;
}) {
  const { gameId, seat: seatStr } = await params;
  const { v: vStr, mode } = await searchParams;
  const seat = Number(seatStr);
  const variant = Math.max(0, Number(vStr ?? 0) | 0);
  const game = getGame(gameId);
  if (!game) notFound();
  const actor = game.players.find((p) => p.seat === seat);
  if (!actor) notFound();

  const sheet = getSheet(game.sheetId) ?? getCustomSheet(game.sheetId);
  const map = new Map<string, Character>();
  if (sheet) for (const c of charactersForSheet(sheet)) map.set(c.id, c);
  for (const p of game.players)
    if (!map.has(p.characterId)) {
      const c = getCharacter(p.characterId);
      if (c) map.set(c.id, c);
    }

  const actorChar = map.get(actor.characterId);
  const record = game.actions.find((a) => a.actorSeat === seat && !a.bluff);
  const spec = specForPhase(actor.characterId, game.phase ?? "night", game.day);

  // ─── 특수 모드: 미치광이의 가짜 공격 지목을 *진짜 데몬*에게 보여주기 ───
  // seat = 미치광이 좌석. 받는 사람은 데몬이라 "님께" 안내는 띄우지 않는다.
  if (mode === "lunatic-choice") {
    const choiceTargets = (record?.targets ?? [])
      .map((s) => game.players.find((p) => p.seat === s))
      .filter((p): p is NonNullable<typeof p> => !!p);
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 py-8">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
            {choiceTargets.length === 0 ? (
              <p className="text-base text-muted">아직 지목이 기록되지 않았습니다.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {choiceTargets.map((p) => (
                    <NameOnlyBig key={p.seat} nickname={p.nickname} />
                  ))}
                </div>
                <h1 className="break-keep text-center text-3xl font-bold leading-snug text-text">
                  {actor.nickname}이(가) {choiceTargets.map((p) => p.nickname).join(", ")}을(를) 지목했습니다
                </h1>
                <p className="break-keep text-center text-sm leading-relaxed text-muted">
                  미치광이(가짜 악마)의 선택입니다 — 실제로 따를지는 당신이 결정합니다
                </p>
              </>
            )}
          </div>
          <div className="mt-6 flex items-center justify-between text-sm">
            <Link href={`/play/${gameId}`} className="text-muted hover:text-text">← 그리모어</Link>
            <span className="text-xs text-muted">{game.day}일차 {game.phase === "night" ? "밤" : "낮"}</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── 특수 모드: 데몬/미치광이에게 첫밤 정보 보여주기 ───
  const isBluffs = mode === "bluffs" || mode === "lunatic-bluffs";
  const isMinions = mode === "minions" || mode === "lunatic-minions";
  const isLunaticMode = mode === "lunatic-bluffs" || mode === "lunatic-minions";
  if (isBluffs || isMinions) {
    // 데몬 모드만 마술사 닉네임 자동 추가(룰: 데몬에게 마술사 좌석을 가짜 하수인으로 노출).
    // 미치광이 모드는 ST가 지정한 가짜 데이터 그대로 — 마술사 처리 X.
    const magicianSeat = !isLunaticMode
      ? game.players.find((p) => p.characterId === "magician")
      : undefined;
    const bluffsIds = isLunaticMode ? game.lunaticBluffs : game.bluffs;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 py-8">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
            <p className="text-center text-base text-muted">{actor.nickname} 님께</p>

            {isBluffs ? (
              <>
                <h1 className="text-center text-3xl font-bold leading-snug text-text">
                  당신의 블러핑 직업입니다
                </h1>
                {bluffsIds.length === 0 ? (
                  <p className="text-base text-muted">블러핑이 아직 선택되지 않았습니다.</p>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-4">
                    {bluffsIds.map((id) => (
                      <RoleTokenBig key={id} ch={map.get(id)} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {(() => {
                  // 데몬 모드: 하수인은 team === "minion"만. 꼭두각시(outsider, marionette)는 별도 보여주기.
                  // 미치광이 모드: ST 지정 좌석(lunaticMinions) 그대로.
                  const all = isLunaticMode
                    ? (game.lunaticMinions
                        .map((s) => game.players.find((p) => p.seat === s))
                        .filter(Boolean) as typeof game.players)
                    : [
                        ...game.players.filter(
                          (p) =>
                            map.get(p.characterId)?.team === "minion" &&
                            p.characterId !== "marionette",
                        ),
                        ...(magicianSeat ? [magicianSeat] : []),
                      ];
                  return (
                    <>
                      <h1 className="break-keep text-center text-3xl font-bold leading-snug text-text">
                        이들은 하수인입니다
                      </h1>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {all.length === 0 ? (
                          <p className="text-base text-muted">하수인이 지정되지 않았습니다.</p>
                        ) : (
                          all.map((p) => <NameOnlyBig key={p.seat} nickname={p.nickname} />)
                        )}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
          <div className="mt-6 flex items-center justify-between text-sm">
            <Link href={`/play/${gameId}`} className="text-muted hover:text-text">← 그리모어</Link>
            <span className="text-xs text-muted">{game.day}일차 {game.phase === "night" ? "밤" : "낮"}</span>
          </div>
        </div>
      </div>
    );
  }

  // showcase 배열이면 variant index 선택, 단일이면 그대로
  const showcaseRaw = spec.showcase;
  const showcase: ShowcaseSpec | undefined = Array.isArray(showcaseRaw)
    ? showcaseRaw[Math.min(variant, showcaseRaw.length - 1)]
    : showcaseRaw;

  const targetSeats = record?.targets ?? [];
  const targetPlayers = targetSeats.map((s) => game.players.find((p) => p.seat === s));
  const resultStr = record?.result ?? "";
  const resultChar = spec.result === "role" && resultStr ? map.get(resultStr) : undefined;
  const recipientPlayer =
    showcase?.recipient === "target" && targetPlayers[0] ? targetPlayers[0] : actor;

  // 메시지 placeholder 치환. {actor} = 액터 닉네임(직업 X — 능력 받는 사람에게 직업명 노출 금지).
  const fill = (tpl?: string) => {
    if (!tpl) return "";
    return tpl
      .replace(/\{role\}/g, resultChar?.name.ko ?? "—")
      .replace(/\{actor\}/g, actor.nickname)
      .replace(/\{target2\}/g, targetPlayers[1]?.nickname ?? "—")
      .replace(/\{target\}/g, targetPlayers[0]?.nickname ?? "—")
      .replace(/\{count\}/g, resultStr || "—")
      .replace(/\{yn\}/g, YN_LABEL[resultStr as "yes" | "no"] ?? "—")
      .replace(/\{team\}/g, TEAM_LABEL[resultStr as "good" | "evil"] ?? "—")
      .replace(/\{result\}/g, resultStr || "—");
  };

  // 토큰 슬롯 렌더링
  const tokenSlot = (slot: ShowcaseToken, i: number) => {
    if (slot === "actor") return <RoleTokenBig key={`a${i}`} ch={actorChar} />;
    if (slot === "result") return <RoleTokenBig key={`r${i}`} ch={resultChar} label={resultStr} />;
    if (slot === "target") {
      const ch = targetPlayers[0] ? map.get(targetPlayers[0].characterId) : undefined;
      return (
        <div key={`t${i}`} className="flex flex-col items-center gap-1">
          <RoleTokenBig ch={ch} />
          {targetPlayers[0] && <span className="text-sm text-muted">{targetPlayers[0].nickname}</span>}
        </div>
      );
    }
    if (slot === "target2") {
      const ch = targetPlayers[1] ? map.get(targetPlayers[1].characterId) : undefined;
      return (
        <div key={`t2${i}`} className="flex flex-col items-center gap-1">
          <RoleTokenBig ch={ch} />
          {targetPlayers[1] && <span className="text-sm text-muted">{targetPlayers[1].nickname}</span>}
        </div>
      );
    }
    if (slot === "targets") {
      return targetPlayers.map((tp, k) => {
        const ch = tp ? map.get(tp.characterId) : undefined;
        return (
          <div key={`ts${i}-${k}`} className="flex flex-col items-center gap-1">
            <RoleTokenBig ch={ch} />
            {tp && <span className="text-sm text-muted">{tp.nickname}</span>}
          </div>
        );
      });
    }
    // 닉네임만 슬롯 (정체 노출 금지 케이스 — 점쟁이·재봉사·귀족 등)
    if (slot === "name") {
      return targetPlayers[0] ? <NameOnlyBig key={`n${i}`} nickname={targetPlayers[0].nickname} /> : null;
    }
    if (slot === "name2") {
      return targetPlayers[1] ? <NameOnlyBig key={`n2${i}`} nickname={targetPlayers[1].nickname} /> : null;
    }
    if (slot === "names") {
      return (
        <div key={`ns${i}`} className="flex flex-wrap items-center justify-center gap-4">
          {targetPlayers.map((tp, k) => (tp ? <NameOnlyBig key={k} nickname={tp.nickname} /> : null))}
        </div>
      );
    }
    return null;
  };

  const headingFilled = fill(showcase?.heading);
  const subFilled = fill(showcase?.subheading);
  const tokens = showcase?.tokens ?? [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
          {!record && actor.characterId !== "marionette" && actor.characterId !== "magician" ? (
            <p className="text-base text-muted">아직 행동이 기록되지 않았습니다.</p>
          ) : showcase ? (
            <>
              {/* 받는 사람 안내 — recipient="none"은 능력 주인이 아닌 제3자에게 보여주는 화면(꼭두각시 → 데몬). */}
              {showcase.recipient !== "none" && (
                <p className="text-center text-base text-muted">{recipientPlayer.nickname} 님께</p>
              )}

              {/* 토큰/닉네임 슬롯 */}
              {tokens.length > 0 && (
                <div className={showcase.stack ? "flex flex-col items-center gap-4" : "flex flex-wrap items-center justify-center gap-4"}>
                  {tokens.flatMap((t, i) => tokenSlot(t, i))}
                </div>
              )}

              {/* 메인 메시지 */}
              {headingFilled && (
                <h1 className="break-keep text-center text-3xl font-bold leading-snug text-text">
                  {headingFilled}
                </h1>
              )}

              {/* 텍스트 결과는 별도 거대 표시 (메제펠리스 비밀단어 등) */}
              {spec.result === "text" && resultStr && (
                <div className="break-words rounded-xl border-2 border-gold/40 bg-gold/5 px-6 py-4 text-center text-4xl font-black tracking-wide text-gold">
                  {resultStr}
                </div>
              )}

              {subFilled && (
                <p className="break-keep text-center text-sm leading-relaxed text-muted">
                  {subFilled}
                </p>
              )}
            </>
          ) : (
            /* 기본 폴백 — showcase 정의 없는 직업: 결과 + 지목 좌석 */
            <>
              {spec.result === "role" && resultChar && <RoleTokenBig ch={resultChar} />}
              {spec.result === "yesno" && (
                <div className={`text-7xl font-black ${resultStr === "yes" ? "text-green-400" : resultStr === "no" ? "text-red-400" : "text-muted"}`}>
                  {resultStr === "yes" ? "예" : resultStr === "no" ? "아니오" : "—"}
                </div>
              )}
              {spec.result === "number" && <div className="text-9xl font-black text-gold">{resultStr || "—"}</div>}
              {spec.result === "team" && (
                <div className="text-7xl font-black" style={{ color: resultStr === "evil" ? "#d23b3b" : "#4a90d9" }}>
                  {resultStr === "evil" ? "악" : resultStr === "good" ? "선" : "—"}
                </div>
              )}
              {spec.result === "text" && (
                <p className="break-words text-center text-2xl font-medium text-text">{resultStr || "—"}</p>
              )}
              {targetPlayers.length > 0 && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted">지목된 자리</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {targetPlayers.map((tp, i) => (
                      <span key={i} className="rounded-full bg-surface-2 px-4 py-1.5 text-base font-medium text-text">
                        {tp?.nickname ?? "—"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href={`/play/${gameId}`} className="text-muted hover:text-text">← 그리모어</Link>
          <span className="text-xs text-muted">{game.day}일차 {game.phase === "night" ? "밤" : "낮"}</span>
        </div>
      </div>
    </div>
  );
}
