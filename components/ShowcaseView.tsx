// 보여주기(showcase) 표준 렌더러 — 순수 프레젠테이션(서버/클라 공용, DB 의존 없음).
//
// 실제 진행 화면의 보여주기 페이지(app/play/[gameId]/show/[seat])와
// 직업 상세의 "능력 미리보기"(components/AbilityPreview)가 *동일한 렌더러*를 쓰게 해서
// 미리보기가 실제 보여주기와 1:1로 일치하도록 보장한다(한쪽만 바뀌어 어긋나는 사고 방지).
//
// 특수 모드(demon/bluffs/minions/lunatic-*)는 게임 전역 데이터에 의존하므로 여기 두지 않고
// show 페이지에 남긴다. 이 컴포넌트는 "행동 기록 → 보여주기"(record 기반)와 폴백만 담당한다.

import { TEAM_MAP } from "@/lib/constants";
import type { ActionSpec, ShowcaseSpec, ShowcaseToken } from "@/lib/night-actions";
import type { Character } from "@/lib/types";

const YN_LABEL = { yes: "예", no: "아니오" } as const;
const TEAM_LABEL = { good: "선", evil: "악" } as const;

/** 큰 직업 토큰(이미지 원형 + 직업명). 정체가 노출돼도 되는 슬롯에 사용. */
export function RoleTokenBig({ ch, label }: { ch?: Character; label?: string }) {
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

/** 닉네임만 보여주는 큰 카드(정체 노출 금지 슬롯 — 점쟁이·재봉사·귀족 등). */
export function NameOnlyBig({ nickname }: { nickname: string }) {
  return (
    <div className="rounded-2xl border-2 border-gold/40 bg-gold/5 px-6 py-4">
      <p className="text-3xl font-bold tracking-wide text-text">{nickname}</p>
    </div>
  );
}

/** 보여주기에 등장하는 좌석의 최소 정보(닉네임 + 직업 — 토큰 렌더용). */
export type ShowcasePlayerLite = { nickname: string; characterId: string };

export type ShowcaseViewProps = {
  /** 능력 사용자 닉네임 */
  actorNickname: string;
  /** 능력 사용자 직업 토큰(actor 슬롯용). disguise/획득직업이 있으면 그 effective 직업. */
  actorChar?: Character;
  /** 지목된 좌석들(없는 자리는 undefined) — targets 길이만큼. */
  targetPlayers: (ShowcasePlayerLite | undefined)[];
  /** 결과 문자열(number→"2", yesno→"yes", role→characterId, team→"good", text→원문). */
  resultStr: string;
  /** 행동 스펙 */
  spec: ActionSpec;
  /** 변형 선택까지 끝난 단일 showcase 스펙(없으면 폴백 렌더). */
  showcase?: ShowcaseSpec;
  /** characterId → Character 조회 */
  getChar: (id: string) => Character | undefined;
  /** 행동이 기록됐는가 — 없고 emptyAllowed=false면 "아직 기록 안 됨" 안내. */
  hasRecord: boolean;
  /** record 없이도 showcase를 보여주는 직업(마술사·꼭두각시)인가. */
  emptyAllowed?: boolean;
};

/**
 * 보여주기 본문(중앙 컬럼 내용)만 렌더한다 — 풀스크린 래퍼/푸터는 호출측이 감싼다.
 * show 페이지의 표준 렌더 블록과 완전히 동일한 마크업.
 */
export function ShowcaseView({
  actorNickname,
  actorChar,
  targetPlayers,
  resultStr,
  spec,
  showcase,
  getChar,
  hasRecord,
  emptyAllowed = false,
}: ShowcaseViewProps) {
  const resultChar = spec.result === "role" && resultStr ? getChar(resultStr) : undefined;
  const recipientNickname =
    showcase?.recipient === "target" && targetPlayers[0]
      ? targetPlayers[0].nickname
      : actorNickname;

  // 메시지 placeholder 치환. {actor} = 액터 닉네임(직업명 노출 금지).
  const fill = (tpl?: string) => {
    if (!tpl) return "";
    return tpl
      .replace(/\{role\}/g, resultChar?.name.ko ?? "—")
      .replace(/\{actor\}/g, actorNickname)
      .replace(/\{targets\}/g, targetPlayers.map((p) => p?.nickname).filter(Boolean).join(", ") || "—")
      .replace(/\{target2\}/g, targetPlayers[1]?.nickname ?? "—")
      .replace(/\{target\}/g, targetPlayers[0]?.nickname ?? "—")
      .replace(/\{count\}/g, resultStr || "—")
      .replace(/\{yn\}/g, YN_LABEL[resultStr as "yes" | "no"] ?? "—")
      .replace(/\{team\}/g, TEAM_LABEL[resultStr as "good" | "evil"] ?? "—")
      .replace(/\{result\}/g, resultStr || "—");
  };

  const tokenSlot = (slot: ShowcaseToken, i: number) => {
    if (slot === "actor") return <RoleTokenBig key={`a${i}`} ch={actorChar} />;
    if (slot === "actorName") return <NameOnlyBig key={`an${i}`} nickname={actorNickname} />;
    if (slot === "result") return <RoleTokenBig key={`r${i}`} ch={resultChar} label={resultStr} />;
    if (slot === "target") {
      const ch = targetPlayers[0] ? getChar(targetPlayers[0].characterId) : undefined;
      return (
        <div key={`t${i}`} className="flex flex-col items-center gap-1">
          <RoleTokenBig ch={ch} />
          {targetPlayers[0] && <span className="text-sm text-muted">{targetPlayers[0].nickname}</span>}
        </div>
      );
    }
    if (slot === "target2") {
      const ch = targetPlayers[1] ? getChar(targetPlayers[1].characterId) : undefined;
      return (
        <div key={`t2${i}`} className="flex flex-col items-center gap-1">
          <RoleTokenBig ch={ch} />
          {targetPlayers[1] && <span className="text-sm text-muted">{targetPlayers[1].nickname}</span>}
        </div>
      );
    }
    if (slot === "targets") {
      return targetPlayers.map((tp, k) => {
        const ch = tp ? getChar(tp.characterId) : undefined;
        return (
          <div key={`ts${i}-${k}`} className="flex flex-col items-center gap-1">
            <RoleTokenBig ch={ch} />
            {tp && <span className="text-sm text-muted">{tp.nickname}</span>}
          </div>
        );
      });
    }
    // 닉네임만 슬롯 (정체 노출 금지 — 점쟁이·재봉사·귀족 등)
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
  // heading/subheading이 이미 {result}를 표시하면(예: 장군) 별도 거대 텍스트 블록 중복을 피한다.
  const headingUsesResult = !!(
    showcase?.heading?.includes("{result}") || showcase?.subheading?.includes("{result}")
  );

  if (!hasRecord && !emptyAllowed) {
    return <p className="text-base text-muted">아직 행동이 기록되지 않았습니다.</p>;
  }

  if (showcase) {
    return (
      <>
        {/* 받는 사람 안내 — recipient="none"은 능력 주인이 아닌 제3자에게 보여줄 때(꼭두각시 → 데몬). */}
        {showcase.recipient !== "none" && (
          <p className="text-center text-base text-muted">{recipientNickname} 님께</p>
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

        {/* 텍스트 결과는 별도 거대 표시 (메제펠리스 비밀단어 등). heading이 {result}를 이미 쓰면 생략. */}
        {spec.result === "text" && resultStr && !headingUsesResult && (
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
    );
  }

  // 기본 폴백 — showcase 정의 없는 직업: 결과 + 지목 좌석
  return (
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
  );
}
