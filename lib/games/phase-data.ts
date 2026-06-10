// 페이즈 스냅샷 단위 데이터: 행동/주장 기록, 지목·투표, 처리완료 체크, 메모, 타이머.
// 전부 current_idx가 가리키는 스냅샷에 기록되고, advancePhase 시 복사되지 않는다(그 페이즈 고유).
import type { NightActionRecord, PhaseTimer, PhaseTimers, VoteRecord } from "../types";
import { currentIdx, db } from "./schema";

export function readActions(gameId: string, idx: number): NightActionRecord[] {
  const row = db
    .prepare("SELECT actions FROM game_phase_actions WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { actions: string } | undefined;
  return row ? (JSON.parse(row.actions) as NightActionRecord[]) : [];
}
function writeActions(gameId: string, idx: number, list: NightActionRecord[]): void {
  db.prepare(
    "INSERT INTO game_phase_actions (game_id,idx,actions) VALUES (?,?,?) ON CONFLICT(game_id,idx) DO UPDATE SET actions = excluded.actions",
  ).run(gameId, idx, JSON.stringify(list));
}

// 기록 식별 키: 실제 행동은 좌석당 1개, 주장(블러핑)은 (좌석+주장직업)당 1개.
const recKey = (a: { actorSeat: number; characterId: string; bluff?: boolean }) =>
  a.bluff ? `b:${a.actorSeat}:${a.characterId}` : `a:${a.actorSeat}`;

/** 현재 페이즈 스냅샷에 행동/주장 기록 (키 기준 upsert) */
export function recordAction(gameId: string, rec: NightActionRecord): void {
  const idx = currentIdx(gameId);
  const key = recKey(rec);
  const list = readActions(gameId, idx).filter((a) => recKey(a) !== key);
  list.push(rec);
  writeActions(gameId, idx, list);
}

/** 현재 페이즈 스냅샷에서 한 기록 삭제 (실제 행동 또는 주장) */
export function clearAction(
  gameId: string,
  actorSeat: number,
  characterId = "",
  bluff = false,
): void {
  const idx = currentIdx(gameId);
  const key = recKey({ actorSeat, characterId, bluff });
  writeActions(
    gameId,
    idx,
    readActions(gameId, idx).filter((a) => recKey(a) !== key),
  );
}

export function readVotes(gameId: string, idx: number): VoteRecord[] {
  const row = db
    .prepare("SELECT votes FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { votes: string } | undefined;
  return row?.votes ? (JSON.parse(row.votes) as VoteRecord[]) : [];
}
function writeVotes(gameId: string, idx: number, list: VoteRecord[]): void {
  db.prepare("UPDATE game_phases SET votes = ? WHERE game_id = ? AND idx = ?").run(
    JSON.stringify(list),
    gameId,
    idx,
  );
}

/** 현재 페이즈 스냅샷에 지목·투표 기록 (대상 좌석 기준 upsert) */
export function recordVote(gameId: string, rec: VoteRecord): void {
  const idx = currentIdx(gameId);
  const list = readVotes(gameId, idx).filter((v) => v.nominee !== rec.nominee);
  list.push(rec);
  writeVotes(gameId, idx, list);
}

/** 현재 페이즈 스냅샷에서 한 지목 기록 삭제 */
export function clearVote(gameId: string, nominee: number): void {
  const idx = currentIdx(gameId);
  writeVotes(gameId, idx, readVotes(gameId, idx).filter((v) => v.nominee !== nominee));
}

export function readDone(gameId: string, idx: number): number[] {
  const row = db
    .prepare("SELECT done FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { done: string } | undefined;
  return row?.done ? (JSON.parse(row.done) as number[]) : [];
}

/** 현재 페이즈 스냅샷에서 한 좌석의 '처리 완료' 토글 */
export function toggleDone(gameId: string, seat: number): void {
  const idx = currentIdx(gameId);
  const cur = readDone(gameId, idx);
  const next = cur.includes(seat) ? cur.filter((s) => s !== seat) : [...cur, seat];
  db.prepare("UPDATE game_phases SET done = ? WHERE game_id = ? AND idx = ?").run(
    JSON.stringify(next),
    gameId,
    idx,
  );
}

export function readNote(gameId: string, idx: number): string {
  const row = db
    .prepare("SELECT note FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { note: string } | undefined;
  return row?.note ?? "";
}

/** 현재 페이즈 스냅샷의 이야기꾼 메모 저장 */
export function setNote(gameId: string, note: string): void {
  const idx = currentIdx(gameId);
  db.prepare("UPDATE game_phases SET note = ? WHERE game_id = ? AND idx = ?").run(
    note,
    gameId,
    idx,
  );
}

// 페이즈별 타이머(밀담/공개토론) — game_phases.timers JSON 컬럼.
export type TimerKind = "whisper" | "open";

export function readTimers(gameId: string, idx: number): PhaseTimers {
  const row = db
    .prepare("SELECT timers FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { timers: string } | undefined;
  if (!row?.timers) return {};
  try {
    return JSON.parse(row.timers) as PhaseTimers;
  } catch {
    return {};
  }
}

function writeTimers(gameId: string, idx: number, t: PhaseTimers): void {
  db.prepare("UPDATE game_phases SET timers = ? WHERE game_id = ? AND idx = ?").run(
    JSON.stringify(t),
    gameId,
    idx,
  );
}

export function getPhaseTimers(gameId: string): PhaseTimers {
  return readTimers(gameId, currentIdx(gameId));
}

export function setTimerDuration(gameId: string, kind: TimerKind, durationSec: number): void {
  db.transaction(() => {
    const idx = currentIdx(gameId);
    const cur = readTimers(gameId, idx);
    const prev: PhaseTimer = cur[kind] ?? { durationSec: 0 };
    cur[kind] = { ...prev, durationSec: Math.max(0, Math.floor(durationSec)) };
    writeTimers(gameId, idx, cur);
  })();
}

export function startTimer(gameId: string, kind: TimerKind): void {
  db.transaction(() => {
    const idx = currentIdx(gameId);
    const cur = readTimers(gameId, idx);
    const prev: PhaseTimer = cur[kind] ?? { durationSec: 0 };
    cur[kind] = { ...prev, startedAt: Date.now(), finishedAt: undefined };
    writeTimers(gameId, idx, cur);
  })();
}

export function stopTimer(gameId: string, kind: TimerKind): void {
  db.transaction(() => {
    const idx = currentIdx(gameId);
    const cur = readTimers(gameId, idx);
    const prev = cur[kind];
    if (!prev?.startedAt) return;
    cur[kind] = { ...prev, finishedAt: Date.now() };
    writeTimers(gameId, idx, cur);
  })();
}

export function clearTimer(gameId: string, kind: TimerKind): void {
  db.transaction(() => {
    const idx = currentIdx(gameId);
    const cur = readTimers(gameId, idx);
    delete cur[kind];
    writeTimers(gameId, idx, cur);
  })();
}
