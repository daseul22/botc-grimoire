// 행동 기록 + 직업별 자동 부수효과 — LAN(recordActionAction)과 온라인(commitPickResponseAction)의 단일 출처.
// 기록 자체(recordAction)에 더해, 룰상 즉시 결정되는 마커/상태를 함께 처리한다.
import { isOncePerGame } from "../night-actions";
import type { NightActionRecord } from "../types";
import { getGame } from "./lifecycle";
import { recordAction, toggleDone } from "./phase-data";
import { toggleMarker } from "./seats";

/**
 * 철학자: 결과로 고른 직업의 'gained' 마커를 본인에게 부여하고,
 * 그 직업이 이미 인플레이면 원본 좌석을 영구 drunk 처리(룰: 원본은 능력을 잃음).
 */
function applyAutoSideEffects(
  gameId: string,
  characterId: string,
  actorSeat: number,
  result: string,
): void {
  if (characterId !== "philosopher" || !result) return;
  const game = getGame(gameId);
  if (!game) return;
  const actor = game.players.find((p) => p.seat === actorSeat);
  const gainedMarker = `gained:${result}`;
  if (actor && !actor.markers.includes(gainedMarker)) toggleMarker(gameId, actorSeat, gainedMarker);
  for (const p of game.players) {
    if (p.seat === actorSeat || p.characterId !== result || p.markers.includes("drunk")) continue;
    toggleMarker(gameId, p.seat, "drunk");
  }
}

/**
 * 행동 기록 + 부수효과. bluff면 부수효과 없이 기록만.
 * - 철학자 gained/drunk(applyAutoSideEffects)
 * - 일회성 능력(oncePerGame) → 'noability:<직업>' 영구 마커(직업별 정확히, 같은 좌석 다른 일회성 능력과 무간섭)
 * - 행동한 좌석은 그 페이즈 처리완료(✓)로 자동 표시
 * captureUndo/touch/권한은 호출측(서버 액션) 책임.
 */
export function commitActionRecord(gameId: string, rec: NightActionRecord): void {
  recordAction(gameId, rec);
  if (rec.bluff) return;
  applyAutoSideEffects(gameId, rec.characterId, rec.actorSeat, rec.result);
  if (isOncePerGame(rec.characterId)) {
    const actor = getGame(gameId)?.players.find((p) => p.seat === rec.actorSeat);
    if (actor && !actor.markers.includes(`noability:${rec.characterId}`))
      toggleMarker(gameId, rec.actorSeat, `noability:${rec.characterId}`);
  }
  const g = getGame(gameId);
  if (g && !g.doneSeats.includes(rec.actorSeat)) toggleDone(gameId, rec.actorSeat);
}
