// 좌석 뷰 redaction — 순수 모듈(클라/서버 공용 가능하나 서버에서 호출해 클라로 보내기 전 적용).
//
// 온라인 플레이에서 플레이어의 /seat 페이지는 "use client" 컴포넌트(SeatView)에 Game을 prop으로 넘긴다.
// Next.js는 이 prop을 RSC/Flight payload로 직렬화해 브라우저로 보내므로, 전체 Game을 그대로 넘기면
// 다른 좌석의 직업·진영, 블러핑, 위장 등 비밀이 네트워크 응답에 그대로 실린다(시계탑 비밀성 붕괴).
//
// 그래서 서버에서 "보는 사람 좌석(viewerSeat)"만 진짜 정보로 남기고 나머지는 지운 뒤 넘긴다.
// 보드에 공개되는 정보(닉네임·좌석·위치·생사)는 유지한다.

import type { Game, GamePlayer } from "./types";

/** 보는 사람 좌석만 비밀(직업·진영·마커·메모·위장)을 남기고 그 외는 모두 지운 Game을 만든다. */
export function redactGameForSeat(game: Game, viewerSeat: number): Game {
  const players: GamePlayer[] = game.players.map((p) =>
    p.seat === viewerSeat
      ? p
      : {
          ...p,
          // 비밀: 다른 좌석의 직업/진영/마커/메모는 지운다(닉네임·좌석·좌표·생사는 공개라 유지).
          characterId: "",
          alignment: "good",
          markers: [],
          memo: "",
        },
  );
  // 위장은 보는 사람 본인 것만(미치광이/주정뱅이가 자기 가짜 직업을 보는 용도).
  const disguises: Record<number, string> = {};
  if (game.disguises?.[viewerSeat] !== undefined) disguises[viewerSeat] = game.disguises[viewerSeat];

  return {
    ...game,
    players,
    disguises,
    // 게임 전역 비밀은 플레이어에게 보내지 않는다.
    actions: [],
    votes: [],
    bluffs: [],
    lunaticBluffs: [],
    lunaticMinions: [],
    note: "",
    doneSeats: [],
    globalMarkers: [],
    claimedSeats: [],
  };
}
