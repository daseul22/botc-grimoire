// 밤 행동 요청/응답 핸드셰이크 — 서버 전용. 이야기꾼↔플레이어 좌석 단위 상태머신.
//
// 흐름: ST가 좌석에 요청 생성 → 플레이어가 매칭 UI로 응답 → ST가 응답 보고 최종 정보 작성 → 플레이어 확인.
//   info           : 플레이어 입력 없이 ST가 곧장 정보 전달(empath·washerwoman 등). 생성 즉시 delivered.
//   pick-players   : 플레이어가 좌석 N개 선택(fortuneteller·monk 등). max_targets로 개수 지정.
//   pick-character : 플레이어가 직업 1개 선택(philosopher 등).
//   pick-player-character : 플레이어가 좌석 1 + 직업 1 둘 다 선택(도박꾼 등). targets[0]=좌석, choice=직업.
//
// 보안: info_payload는 자기완결 보여주기 데이터(lib/showcase의 ShowcasePayload)다. 능력이 정당하게
// 드러내는 것만 담긴다(이름만 슬롯=닉네임, 정체 슬롯만 charId). 플레이어에겐 *자기 좌석 요청만*
// 내려가므로 전체 게임이 새지 않는다.
import { currentIdx, db, now } from "./games/schema";
import type { ShowcasePayload } from "./showcase";

export type NightRequestKind = "info" | "pick-players" | "pick-character" | "pick-player-character";
export type NightRequestStatus = "awaiting" | "responded" | "delivered" | "done" | "cancelled";

export type NightRequest = {
  id: string;
  gameId: string;
  seat: number;
  kind: NightRequestKind;
  prompt: string;
  maxTargets: number;
  status: NightRequestStatus;
  playerTargets: number[];
  playerChoice: string;
  /** 전달된 보여주기 내용(ShowcasePayload). 미전달이면 null. */
  info: ShowcasePayload | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  game_id: string;
  seat: number;
  idx: number;
  kind: NightRequestKind;
  prompt: string;
  max_targets: number;
  status: NightRequestStatus;
  player_targets: string;
  player_choice: string;
  info_payload: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVE = "('awaiting','responded','delivered')";

function toReq(r: Row): NightRequest {
  return {
    id: r.id,
    gameId: r.game_id,
    seat: r.seat,
    kind: r.kind,
    prompt: r.prompt,
    maxTargets: r.max_targets,
    status: r.status,
    playerTargets: JSON.parse(r.player_targets) as number[],
    playerChoice: r.player_choice,
    info: r.info_payload ? (JSON.parse(r.info_payload) as ShowcasePayload) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 요청 생성 — 같은 좌석·같은 페이즈의 진행 중 요청은 먼저 취소(좌석당 활성 1개 유지). info면 즉시 delivered. */
export function createRequest(input: {
  gameId: string;
  seat: number;
  kind: NightRequestKind;
  prompt?: string;
  maxTargets?: number;
  info?: ShowcasePayload;
}): string {
  const id = "nr-" + crypto.randomUUID().slice(0, 8);
  const t = now();
  const idx = currentIdx(input.gameId);
  const isInfo = input.kind === "info";
  const status: NightRequestStatus = isInfo ? "delivered" : "awaiting";
  db.transaction(() => {
    db.prepare(
      `UPDATE game_night_requests SET status='cancelled', updated_at=? WHERE game_id=? AND seat=? AND idx=? AND status IN ${ACTIVE}`,
    ).run(t, input.gameId, input.seat, idx);
    db.prepare(
      `INSERT INTO game_night_requests
        (id,game_id,seat,idx,kind,prompt,max_targets,status,player_targets,player_choice,info_payload,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,'[]','',?,?,?)`,
    ).run(
      id,
      input.gameId,
      input.seat,
      idx,
      input.kind,
      input.prompt ?? "",
      input.maxTargets ?? 1,
      status,
      input.info ? JSON.stringify(input.info) : null,
      t,
      t,
    );
  })();
  return id;
}

export function getRequest(id: string): NightRequest | undefined {
  const r = db.prepare("SELECT * FROM game_night_requests WHERE id = ?").get(id) as Row | undefined;
  return r ? toReq(r) : undefined;
}

/** 한 좌석의 활성 요청(플레이어가 행동/확인할 것) — 현재 페이즈 스냅샷만. 없으면 undefined. */
export function getActiveForSeat(gameId: string, seat: number): NightRequest | undefined {
  const r = db
    .prepare(
      `SELECT * FROM game_night_requests WHERE game_id=? AND seat=? AND idx=? AND status IN ${ACTIVE} ORDER BY created_at DESC LIMIT 1`,
    )
    .get(gameId, seat, currentIdx(gameId)) as Row | undefined;
  return r ? toReq(r) : undefined;
}

/** 게임의 활성 요청(이야기꾼 콘솔용) — 현재 페이즈 스냅샷만. 지난 밤 요청이 다음 밤 행에 새지 않도록. */
export function listActive(gameId: string): NightRequest[] {
  const rows = db
    .prepare(
      `SELECT * FROM game_night_requests WHERE game_id=? AND idx=? AND status IN ${ACTIVE} ORDER BY seat`,
    )
    .all(gameId, currentIdx(gameId)) as Row[];
  return rows.map(toReq);
}

/** 게임의 모든 요청(기록 — 이야기꾼). 최근 순. 취소는 제외. */
export function listAllForGame(gameId: string, limit = 200): NightRequest[] {
  const rows = db
    .prepare(
      "SELECT * FROM game_night_requests WHERE game_id=? AND status != 'cancelled' ORDER BY created_at DESC LIMIT ?",
    )
    .all(gameId, limit) as Row[];
  return rows.map(toReq);
}

/** 한 좌석의 모든 요청(기록 — 플레이어). 최근 순. 취소 제외. */
export function listAllForSeat(gameId: string, seat: number, limit = 100): NightRequest[] {
  const rows = db
    .prepare(
      "SELECT * FROM game_night_requests WHERE game_id=? AND seat=? AND status != 'cancelled' ORDER BY created_at DESC LIMIT ?",
    )
    .all(gameId, seat, limit) as Row[];
  return rows.map(toReq);
}

/** 플레이어 응답 — awaiting일 때만. */
export function respond(id: string, targets: number[], choice: string): void {
  db.prepare(
    "UPDATE game_night_requests SET status='responded', player_targets=?, player_choice=?, updated_at=? WHERE id=? AND status='awaiting'",
  ).run(JSON.stringify(targets), choice, now(), id);
}

/** ST 최종 정보 전달. */
export function deliver(id: string, info: ShowcasePayload): void {
  db.prepare(
    "UPDATE game_night_requests SET status='delivered', info_payload=?, updated_at=? WHERE id=? AND status IN ('awaiting','responded')",
  ).run(JSON.stringify(info), now(), id);
}

/** 플레이어가 전달된 정보를 확인. */
export function acknowledge(id: string): void {
  db.prepare(
    "UPDATE game_night_requests SET status='done', updated_at=? WHERE id=? AND status='delivered'",
  ).run(now(), id);
}

/**
 * ST가 응답을 기록해 요청을 완료 처리 — 보여줄 정보가 없는 선택 능력(수도사·임프·독살자 등)용.
 * responded일 때만. 플레이어의 '대기 중' 패널이 닫힌다(정보 직업은 deliver→acknowledge로 마무리).
 */
export function complete(id: string): void {
  db.prepare(
    "UPDATE game_night_requests SET status='done', updated_at=? WHERE id=? AND status='responded'",
  ).run(now(), id);
}

export function cancelRequest(id: string): void {
  db.prepare("UPDATE game_night_requests SET status='cancelled', updated_at=? WHERE id=?").run(now(), id);
}

/** 게임 삭제 시 정리. */
export function deleteRequests(gameId: string): void {
  db.prepare("DELETE FROM game_night_requests WHERE game_id = ?").run(gameId);
}
