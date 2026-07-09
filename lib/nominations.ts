// 낮 지목·투표 핸드셰이크 — 서버 전용. 시계바늘 순차 스윕.
//
// 라이브 레이어(임시): 지목→순차 투표가 진행되는 동안의 상태. committed 레이어
// (game_phases.votes의 VoteRecord)와 별개다 — 스윕이 tallied되면 ST가 countUp()으로
// 최종 찬성표를 기존 recordVote로 확정한다. 복기·언더테이커·식인귀는 committed만 본다.
//
// 순서(order): 지명자 다음 좌석부터 시계방향(좌석 인덱스 순), 마지막이 지명자 본인.
// 투표 불가 좌석(죽었고 유령표 없음)은 스킵한다. 투표는 공개 정보라 redaction 대상이 아니다.
import { db, now } from "./games/schema";

export type NominationStatus = "pending" | "voting" | "tallied" | "committed" | "cancelled";

/** 자격 판정을 위한 최소 좌석 정보(현재 스냅샷 생사 + 전역 유령표). */
export type SeatLite = { seat: number; status: "alive" | "dead"; ghostVoteUsed: boolean };

export type Hand = { seat: number; hand: 0 | 1; isGhost: boolean };

export type Nomination = {
  id: string;
  gameId: string;
  day: number;
  nominator: number;
  nominee: number;
  status: NominationStatus;
  /** 투표 순서(좌석 배열). pointer가 이 배열을 가리킨다. */
  order: number[];
  /** 현재 투표 중인 좌석의 order 인덱스. -1=시작 전, order.length 이상=종료. */
  pointer: number;
  /** advance CAS 가드. */
  step: number;
  /** 좌석당 제한시간(초). 0=수동. */
  perSeatSec: number;
  /** 현재 턴 시작 ISO(일시정지/비투표 시 null). 클라 카운트다운의 기준. */
  turnStartedAt: string | null;
  paused: boolean;
  /** 지금까지 집계된 손(공개). */
  hands: Hand[];
  createdAt: string;
  updatedAt: string;
};

type NomRow = {
  id: string;
  game_id: string;
  day: number;
  nominator_seat: number;
  nominee_seat: number;
  status: NominationStatus;
  order_json: string;
  pointer: number;
  step: number;
  per_seat_sec: number;
  turn_started_at: string | null;
  paused: number;
  created_at: string;
  updated_at: string;
};
type HandRow = { voter_seat: number; hand: number; is_ghost: number };

/** 활성(단말 아님) 상태 집합 — 하루 한도 검사·활성 조회에 사용. */
const LIVE = "('pending','voting','tallied')";

function loadHands(id: string): Hand[] {
  const rows = db
    .prepare("SELECT voter_seat, hand, is_ghost FROM game_nomination_hands WHERE nomination_id = ? ORDER BY voter_seat")
    .all(id) as HandRow[];
  return rows.map((r) => ({ seat: r.voter_seat, hand: (r.hand ? 1 : 0) as 0 | 1, isGhost: !!r.is_ghost }));
}

function toNom(r: NomRow): Nomination {
  return {
    id: r.id,
    gameId: r.game_id,
    day: r.day,
    nominator: r.nominator_seat,
    nominee: r.nominee_seat,
    status: r.status,
    order: JSON.parse(r.order_json) as number[],
    pointer: r.pointer,
    step: r.step,
    perSeatSec: r.per_seat_sec,
    turnStartedAt: r.turn_started_at,
    paused: !!r.paused,
    hands: loadHands(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * 투표 순서 계산(순수). 지명자 다음 좌석부터 시계방향(좌석 인덱스 순환), 마지막이 지명자.
 * 자격: 생존 좌석 or (사망 & 유령표 미사용) 좌석만 포함. 좌석 번호가 0..n-1 연속이 아니어도
 * 정렬된 좌석 목록을 순환해 순서를 만든다.
 */
export function computeOrder(seats: SeatLite[], nominee: number): number[] {
  const ss = [...seats].map((s) => s.seat).sort((a, b) => a - b);
  const n = ss.length;
  const ni = ss.indexOf(nominee);
  if (ni < 0) return [];
  const eligible = new Map(seats.map((s) => [s.seat, s.status === "alive" || !s.ghostVoteUsed]));
  const order: number[] = [];
  for (let k = 1; k <= n; k++) {
    const seat = ss[(ni + k) % n]; // k=n → 지명자 본인(마지막)
    if (eligible.get(seat)) order.push(seat);
  }
  return order;
}

/** 지목 생성(pending). order는 좌석 자격으로 계산해 저장한다. */
export function openNomination(input: {
  gameId: string;
  day: number;
  nominator: number;
  nominee: number;
  seats: SeatLite[];
  perSeatSec?: number;
}): string {
  const id = "nom-" + crypto.randomUUID().slice(0, 8);
  const t = now();
  const order = computeOrder(input.seats, input.nominee);
  db.prepare(
    `INSERT INTO game_nominations
      (id,game_id,day,nominator_seat,nominee_seat,status,order_json,pointer,step,per_seat_sec,turn_started_at,paused,created_at,updated_at)
     VALUES (?,?,?,?,?,'pending',?,-1,0,?,NULL,0,?,?)`,
  ).run(
    id,
    input.gameId,
    input.day,
    input.nominator,
    input.nominee,
    JSON.stringify(order),
    Math.max(0, Math.min(60, input.perSeatSec ?? 0)),
    t,
    t,
  );
  return id;
}

export function getById(id: string): Nomination | undefined {
  const r = db.prepare("SELECT * FROM game_nominations WHERE id = ?").get(id) as NomRow | undefined;
  return r ? toNom(r) : undefined;
}

/** 해당 낮의 활성 지목(플레이어/ST가 지금 다룰 것). pending/voting/tallied 중 최신 1건. */
export function getActive(gameId: string, day: number): Nomination | undefined {
  const r = db
    .prepare(
      `SELECT * FROM game_nominations WHERE game_id=? AND day=? AND status IN ${LIVE} ORDER BY created_at DESC LIMIT 1`,
    )
    .get(gameId, day) as NomRow | undefined;
  return r ? toNom(r) : undefined;
}

/** 해당 낮의 모든 지목(취소 제외). 하루 한도 검사·ST 목록·복기용. 최근 순. */
export function listForDay(gameId: string, day: number): Nomination[] {
  const rows = db
    .prepare(
      "SELECT * FROM game_nominations WHERE game_id=? AND day=? AND status != 'cancelled' ORDER BY created_at DESC",
    )
    .all(gameId, day) as NomRow[];
  return rows.map(toNom);
}

/** 투표 시작 — pending→voting, 첫 좌석으로. */
export function startVote(id: string): void {
  const t = now();
  db.prepare(
    `UPDATE game_nominations
       SET status='voting', pointer=0, step=step+1, paused=0, turn_started_at=?, updated_at=?
     WHERE id=? AND status='pending'`,
  ).run(t, t, id);
}

/** 손 설정(현재 좌석) — 액션에서 seat===현재좌석·자격 검증 후 호출. upsert. */
export function setHand(id: string, seat: number, hand: 0 | 1, isGhost: boolean): void {
  db.prepare(
    `INSERT INTO game_nomination_hands (nomination_id,voter_seat,hand,is_ghost)
     VALUES (?,?,?,?)
     ON CONFLICT(nomination_id,voter_seat) DO UPDATE SET hand=excluded.hand, is_ghost=excluded.is_ghost`,
  ).run(id, seat, hand ? 1 : 0, isGhost ? 1 : 0);
  db.prepare("UPDATE game_nominations SET updated_at=? WHERE id=?").run(now(), id);
}

export type AdvanceResult = "advanced" | "tallied" | "noop";

/**
 * 다음 좌석으로 — CAS(step 불일치면 no-op). 현재 좌석 손을 확정(미설정이면 down)하고,
 * 유령표 up이면 그 좌석의 ghost_vote_used를 소모 확정한다. 마지막을 넘어가면 tallied.
 * 트랜잭션으로 원자 처리 → 중복 자동 advance가 겹쳐도 안전.
 */
export function advance(id: string, expectedStep: number): AdvanceResult {
  return db.transaction((): AdvanceResult => {
    const r = db.prepare("SELECT * FROM game_nominations WHERE id = ?").get(id) as NomRow | undefined;
    if (!r || r.status !== "voting") return "noop";
    if (r.step !== expectedStep) return "noop"; // CAS: 이미 다른 호출이 진행
    const order = JSON.parse(r.order_json) as number[];
    const curSeat = order[r.pointer];
    const t = now();
    if (curSeat !== undefined) {
      // 현재 좌석 손 확정: 미설정이면 down으로 확정.
      const hr = db
        .prepare("SELECT hand, is_ghost FROM game_nomination_hands WHERE nomination_id=? AND voter_seat=?")
        .get(id, curSeat) as HandRow | undefined;
      if (!hr) {
        db.prepare(
          "INSERT INTO game_nomination_hands (nomination_id,voter_seat,hand,is_ghost) VALUES (?,?,0,0)",
        ).run(id, curSeat);
      } else if (hr.hand && hr.is_ghost) {
        // 유령표를 든 손 → 소모 확정(전역 game_players.ghost_vote_used).
        db.prepare("UPDATE game_players SET ghost_vote_used=1 WHERE game_id=? AND seat=?").run(r.game_id, curSeat);
      }
    }
    const next = r.pointer + 1;
    if (next >= order.length) {
      db.prepare(
        "UPDATE game_nominations SET status='tallied', pointer=?, step=step+1, turn_started_at=NULL, updated_at=? WHERE id=?",
      ).run(order.length, t, id);
      return "tallied";
    }
    db.prepare(
      "UPDATE game_nominations SET pointer=?, step=step+1, turn_started_at=?, updated_at=? WHERE id=?",
    ).run(next, t, t, id);
    return "advanced";
  })();
}

/** 일시정지 — 자동 advance 멈춤(turn_started_at 비움). step 증가로 감시자 갱신. */
export function pause(id: string): void {
  const t = now();
  db.prepare(
    "UPDATE game_nominations SET paused=1, step=step+1, turn_started_at=NULL, updated_at=? WHERE id=? AND status='voting'",
  ).run(t, id);
}

export function resume(id: string): void {
  const t = now();
  db.prepare(
    "UPDATE game_nominations SET paused=0, step=step+1, turn_started_at=?, updated_at=? WHERE id=? AND status='voting'",
  ).run(t, t, id);
}

/** 좌석당 속도 조정(초). 0=수동. */
export function setPace(id: string, perSeatSec: number): void {
  db.prepare("UPDATE game_nominations SET per_seat_sec=?, updated_at=? WHERE id=?").run(
    Math.max(0, Math.min(60, perSeatSec | 0)),
    now(),
    id,
  );
}

export function cancel(id: string): void {
  db.prepare("UPDATE game_nominations SET status='cancelled', updated_at=? WHERE id=?").run(now(), id);
}

/** 정산 확정 표시(실제 VoteRecord 기록은 액션이 recordVote로 수행). */
export function markCommitted(id: string): void {
  db.prepare(
    "UPDATE game_nominations SET status='committed', updated_at=? WHERE id=? AND status IN ('voting','tallied')",
  ).run(now(), id);
}

/** 찬성(up) 표 수. */
export function countUp(id: string): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS c FROM game_nomination_hands WHERE nomination_id=? AND hand=1")
      .get(id) as { c: number }
  ).c;
}

/** 지난 낮의 미커밋 지목 정리(새 지목 생성 전 호출) — 특정 낮 이외의 활성 지목을 취소. */
export function cancelStale(gameId: string, keepDay: number): void {
  db.prepare(
    `UPDATE game_nominations SET status='cancelled', updated_at=? WHERE game_id=? AND day != ? AND status IN ${LIVE}`,
  ).run(now(), gameId, keepDay);
}
