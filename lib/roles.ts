// 첫밤 정보 단계의 '악마/하수인' 좌석 판정 — 순수 모듈(클라/서버 공용, DB 의존 없음).
//
// 같은 규칙이 여러 곳(LunaticActionRow의 '실제 악마와 동일하게 채우기' 프리셋,
// show 페이지의 ?mode=demon / ?mode=minions)에서 손으로 복제되면, 한쪽만 바뀔 때
// 미치광이가 진짜 악마와 다른 화면을 보게 된다(정보 사고). 단일 출처로 막는다.
import type { Team } from "./types";

type SeatRole = { seat: number; characterId: string };
type TeamOf = (characterId: string) => Team | undefined;

/**
 * 데몬이 첫밤에 '하수인'으로 보는 좌석 — 진짜 하수인(꼭두각시 제외) + 마술사.
 * (마술사는 데몬에게 하수인으로 등록되는 룰.) 좌석 순서는 플레이어 순서 + 마술사 뒤.
 * excludeSeat: 미치광이 프리셋에서 미치광이 본인 좌석 제외용.
 */
export function seatsShownAsMinions(
  players: SeatRole[],
  teamOf: TeamOf,
  opts?: { excludeSeat?: number },
): number[] {
  const magicianSeat = players.find((p) => p.characterId === "magician")?.seat;
  const seats = players
    .filter((p) => teamOf(p.characterId) === "minion" && p.characterId !== "marionette")
    .map((p) => p.seat);
  if (magicianSeat != null) seats.push(magicianSeat);
  return opts?.excludeSeat != null ? seats.filter((s) => s !== opts.excludeSeat) : seats;
}

/**
 * 하수인이 첫밤에 '악마'로 보는 좌석 — 진짜 악마 + 마술사.
 * (마술사는 하수인에게 데몬으로 등록되는 룰.) show ?mode=demon이 사용.
 */
export function seatsShownAsDemons(players: SeatRole[], teamOf: TeamOf): number[] {
  const magicianSeat = players.find((p) => p.characterId === "magician")?.seat;
  const seats = players
    .filter((p) => teamOf(p.characterId) === "demon")
    .map((p) => p.seat);
  if (magicianSeat != null) seats.push(magicianSeat);
  return seats;
}
