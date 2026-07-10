// 보여주기 payload 렌더러 — 순수 프레젠테이션(서버/클라 공용). lib/showcase.ts의 ShowcasePayload를 그린다.
//
// LAN 보여주기 페이지(app/play/[gameId]/show/[seat])와 온라인 플레이어 패널(NightRequestPanel)이
// *같은 렌더러*를 써서, ST가 폰을 들이밀든 원격으로 push하든 플레이어가 보는 화면이 1:1로 일치한다.
// 표준 payload는 기존 ShowcaseView를 그대로 재사용하고, 특수 모드(블러핑/하수인/악마 정보)만 여기서 그린다.

import type { ActionSpec } from "@/lib/night-actions";
import type { ShowcasePayload } from "@/lib/showcase";
import type { Character } from "@/lib/types";
import { MARKER_MAP, parseMarker } from "@/lib/markers";
import { CharacterIcon } from "./CharacterIcon";
import { NameOnlyBig, RoleTokenBig, ShowcaseView } from "./ShowcaseView";

export function ShowcasePayloadView({
  payload,
  getChar,
}: {
  payload: ShowcasePayload;
  getChar: (id: string) => Character | undefined;
}) {
  if (payload.kind === "roleTokens") {
    return (
      <>
        {payload.forNickname && <p className="text-center text-base text-muted">{payload.forNickname} 님께</p>}
        {payload.roleTokens.length === 0 ? (
          <p className="text-base text-muted">{payload.emptyText}</p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4">
            {payload.roleTokens.map((id) => (
              <RoleTokenBig key={id} ch={getChar(id)} />
            ))}
          </div>
        )}
        <h1 className="break-keep text-center text-3xl font-bold leading-snug text-text">{payload.heading}</h1>
      </>
    );
  }

  if (payload.kind === "nameTokens") {
    return (
      <>
        {payload.forNickname && <p className="text-center text-base text-muted">{payload.forNickname} 님께</p>}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {payload.nameTokens.length === 0 ? (
            <p className="text-base text-muted">{payload.emptyText}</p>
          ) : (
            payload.nameTokens.map((n, i) => <NameOnlyBig key={`${n}-${i}`} nickname={n} />)
          )}
        </div>
        <h1 className="break-keep text-center text-3xl font-bold leading-snug text-text">{payload.heading}</h1>
        {payload.subheading && (
          <p className="break-keep text-center text-sm leading-relaxed text-muted">{payload.subheading}</p>
        )}
      </>
    );
  }

  if (payload.kind === "firstNightInfo") {
    // 첫밤 정보 합본 — 여러 섹션(동료 하수인 / 악마 / 블러핑)을 한 화면에.
    return (
      <>
        <p className="text-center text-base text-muted">{payload.forNickname} 님께</p>
        {payload.sections.length === 0 ? (
          <p className="text-base text-muted">{payload.emptyText}</p>
        ) : (
          payload.sections.map((sec, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold">{sec.label}</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {sec.kind === "roles"
                  ? sec.items.map((id) => <RoleTokenBig key={id} ch={getChar(id)} />)
                  : sec.items.map((n, k) => <NameOnlyBig key={`${n}-${k}`} nickname={n} />)}
              </div>
            </div>
          ))
        )}
      </>
    );
  }

  if (payload.kind === "grimoire") {
    // 마도서 전체 — 이야기꾼 캔버스와 동일한 원형 좌석 배치(좌표 x/y)로 실제 직업/닉네임/진영/생사/마커.
    const n = payload.seats.length;
    const tokenPx = n > 11 ? 34 : n > 8 ? 40 : 48;
    const INSET = 0.1; // 플레이어 보드와 동일 — 가장자리 라벨 클리핑 방지.
    const posPct = (v: number) => `${(INSET + v * (1 - 2 * INSET)) * 100}%`;
    return (
      <div className="w-full">
        <p className="mb-2 text-center text-base text-muted">{payload.forNickname} 님 — 마도서(그리모어)</p>
        {n === 0 ? (
          <p className="text-center text-base text-muted">{payload.emptyText}</p>
        ) : (
          <div
            className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-border bg-bg"
            style={{ backgroundImage: "radial-gradient(circle, rgba(212,162,58,0.06) 0%, transparent 70%)" }}
          >
            {payload.seats.map((s) => {
              const ch = getChar(s.characterId);
              const evil = s.alignment === "evil";
              const marks = s.markers
                .map((m) => MARKER_MAP[parseMarker(m).base])
                .filter((mk): mk is NonNullable<typeof mk> => !!mk);
              const glyph = s.deathCause === "execution" ? "☠️" : s.deathCause === "night" ? "🌙" : "✕";
              return (
                <div
                  key={s.seat}
                  className="absolute flex flex-col items-center gap-0.5"
                  style={{ left: posPct(s.x), top: posPct(s.y), transform: "translate(-50%, -50%)" }}
                >
                  <div className="relative" style={{ width: tokenPx, height: tokenPx }}>
                    <div
                      className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 bg-bg ${
                        s.alive ? "" : "opacity-40 grayscale"
                      } ${evil ? "border-red-500/70" : "border-border"}`}
                    >
                      {ch ? (
                        <CharacterIcon character={ch} size={tokenPx - 6} />
                      ) : (
                        <span className="font-bold text-muted" style={{ fontSize: tokenPx * 0.42 }}>?</span>
                      )}
                      {!s.alive && (
                        <span className="absolute inset-0 flex items-center justify-center text-red-500" style={{ fontSize: tokenPx * 0.45 }}>
                          {glyph}
                        </span>
                      )}
                    </div>
                    {marks.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex gap-0.5">
                        {marks.map((mk, i) => (
                          <span key={i} title={mk.label} className="h-2 w-2 rounded-full border border-bg" style={{ background: mk.color }} />
                        ))}
                      </span>
                    )}
                  </div>
                  <span className="pointer-events-none max-w-[4.5rem] truncate text-[10px] font-semibold text-text">
                    {ch?.name.ko ?? "?"}
                  </span>
                  <span className="pointer-events-none max-w-[4.5rem] truncate text-[9px] text-muted">
                    {s.seat + 1}. {s.nickname}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (payload.kind === "standard") {
    // 표준 — 기존 ShowcaseView 재사용(능력 미리보기·LAN show와 동일 마크업).
    return (
      <ShowcaseView
        actorNickname={payload.actorNickname}
        actorChar={payload.actorCharacterId ? getChar(payload.actorCharacterId) : undefined}
        targetPlayers={payload.targets.map((t) => ({ nickname: t.nickname, characterId: t.characterId ?? "" }))}
        resultStr={payload.resultStr}
        spec={payload.spec as ActionSpec}
        showcase={payload.showcase ?? undefined}
        getChar={getChar}
        hasRecord={payload.hasRecord}
        emptyAllowed={payload.emptyAllowed}
      />
    );
  }

  // 알 수 없는/레거시 페이로드(구버전 전달 정보) — 안전 폴백(막힌 화면 방지).
  return <p className="text-base text-muted">정보가 도착했습니다.</p>;
}
