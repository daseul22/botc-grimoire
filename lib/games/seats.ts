// 좌석 단위 조작: 위치/고정/직업/메모/진영/닉네임/자리교환(전역 컬럼),
// 생사·마커(현재 페이즈 스냅샷), 유령표.
import { MARKER_MAP, parseMarker } from "../markers";
import { currentIdx, db, now, readState, writeState } from "./schema";

export function savePositions(
  gameId: string,
  positions: { seat: number; x: number; y: number }[],
): void {
  const upd = db.prepare(
    "UPDATE game_players SET x = ?, y = ? WHERE game_id = ? AND seat = ?",
  );
  db.transaction(() => {
    for (const p of positions) upd.run(p.x, p.y, gameId, p.seat);
    db.prepare("UPDATE games SET updated_at = ? WHERE id = ?").run(now(), gameId);
  })();
}

export function setLock(gameId: string, seat: number, locked: boolean): void {
  db.prepare("UPDATE game_players SET locked = ? WHERE game_id = ? AND seat = ?").run(
    locked ? 1 : 0,
    gameId,
    seat,
  );
}

/** 직업/진영 부분 변경 (1일차 밤 수동 조정 · 교체). 좌석/위치/상태는 유지. */
export function setRoles(
  gameId: string,
  updates: { seat: number; characterId: string; alignment: string }[],
): void {
  const upd = db.prepare(
    "UPDATE game_players SET character_id = ?, alignment = ? WHERE game_id = ? AND seat = ?",
  );
  db.transaction(() => {
    for (const u of updates) upd.run(u.characterId, u.alignment, gameId, u.seat);
  })();
}

/** 플레이어 메모 (전역, 스냅샷 무관) */
export function setMemo(gameId: string, seat: number, memo: string): void {
  db.prepare("UPDATE game_players SET memo = ? WHERE game_id = ? AND seat = ?").run(
    memo,
    gameId,
    seat,
  );
}

// politician/mezepheles/cult leader 등 진영이 게임 중에 바뀌는 직업 대응.
export function setAlignment(gameId: string, seat: number, alignment: "good" | "evil"): void {
  db.prepare("UPDATE game_players SET alignment = ? WHERE game_id = ? AND seat = ?").run(
    alignment,
    gameId,
    seat,
  );
}

// 좌석 닉네임 수정(주로 1일차 밤 세팅 단계).
export function setNickname(gameId: string, seat: number, nickname: string): void {
  db.prepare("UPDATE game_players SET nickname = ? WHERE game_id = ? AND seat = ?").run(
    nickname,
    gameId,
    seat,
  );
}

// 두 좌석의 닉네임만 교환. 좌석에 고정된 직업/마커/위치는 그대로.
// 오프라인 세팅에서 직업 배정 후 사람이 자리만 옮긴 케이스 대응.
export function swapSeats(gameId: string, a: number, b: number): void {
  if (a === b) return;
  db.transaction(() => {
    const get = db.prepare(
      "SELECT nickname FROM game_players WHERE game_id = ? AND seat = ?",
    );
    const aRow = get.get(gameId, a) as { nickname: string } | undefined;
    const bRow = get.get(gameId, b) as { nickname: string } | undefined;
    if (!aRow || !bRow) return;
    const upd = db.prepare(
      "UPDATE game_players SET nickname = ? WHERE game_id = ? AND seat = ?",
    );
    upd.run(bRow.nickname, gameId, a);
    upd.run(aRow.nickname, gameId, b);
  })();
}

/** 현재 페이즈 스냅샷의 한 좌석 상태 변경 (cause: 사망 원인) */
export function setStatus(
  gameId: string,
  seat: number,
  status: string,
  cause = "",
): void {
  const idx = currentIdx(gameId);
  const s = readState(gameId, idx);
  s[seat] = {
    status,
    markers: s[seat]?.markers ?? [],
    cause: status === "dead" ? cause : "",
  };
  writeState(gameId, idx, s);
}

/** 현재 페이즈 스냅샷의 한 좌석 마커 토글 */
export function toggleMarker(gameId: string, seat: number, markerId: string): void {
  const idx = currentIdx(gameId);
  const s = readState(gameId, idx);
  const cur = s[seat]?.markers ?? [];
  const base = parseMarker(markerId).base;
  // multi 마커(능력획득·능력없음)는 한 좌석에 여러 인스턴스 공존(식인종이 철학자 먹고 또 능력 얻는 식).
  // 단일 마커는 동일 base 제거 후 추가(집착 대상 교체 등). 어느 쪽이든 정확히 같은 문자열이면 해제.
  const isMulti = !!MARKER_MAP[base]?.multi;
  const markers = cur.includes(markerId)
    ? cur.filter((m) => m !== markerId)
    : isMulti
      ? [...cur, markerId]
      : [...cur.filter((m) => parseMarker(m).base !== base), markerId];
  s[seat] = { status: s[seat]?.status ?? "alive", markers };
  writeState(gameId, idx, s);
}

/** 유령표 사용 토글 (전역) */
export function setGhostVote(gameId: string, seat: number, used: boolean): void {
  db.prepare(
    "UPDATE game_players SET ghost_vote_used = ? WHERE game_id = ? AND seat = ?",
  ).run(used ? 1 : 0, gameId, seat);
}
