// 게임 전역 메타: 악마 블러핑, 자리 잠금(claim), 글로벌 마커,
// 미치광이 가짜 정보, 좌석별 가짜 직업(disguise).
// 페이즈 스냅샷과 무관하게 games 테이블 컬럼에 저장된다.
import { db, now } from "./schema";

/** 악마 블러핑 직업 (전역) */
export function setBluffs(gameId: string, ids: string[]): void {
  db.prepare("UPDATE games SET bluffs = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(ids.slice(0, 3)),
    now(),
    gameId,
  );
}

// 자리 잠금(직업 배포 링크용). 좌석 → 점유 시각(epoch ms) 맵.
// 한 번 점유된 좌석은 다른 사람이 못 본다(락). 점유 시각으로 30초 만료를 판정한다.
export type ClaimMap = Record<number, number>;

export function getClaims(gameId: string): ClaimMap {
  const row = db.prepare("SELECT claimed FROM games WHERE id = ?").get(gameId) as
    | { claimed: string }
    | undefined;
  if (!row?.claimed) return {};
  try {
    const parsed = JSON.parse(row.claimed);
    // 구버전(number[]) 호환: 시각 정보가 없으니 0(=즉시 만료)으로 둔다.
    if (Array.isArray(parsed)) {
      const m: ClaimMap = {};
      for (const s of parsed) m[Number(s)] = 0;
      return m;
    }
    return parsed as ClaimMap;
  } catch {
    return {};
  }
}

// 좌석 점유 시도. 이미 점유됐으면 ok:false. 동시 요청 대비 트랜잭션으로 처리.
export function claimSeat(gameId: string, seat: number): { ok: boolean } {
  return db.transaction(() => {
    const claims = getClaims(gameId);
    if (seat in claims) return { ok: false };
    claims[seat] = Date.now();
    db.prepare("UPDATE games SET claimed = ? WHERE id = ?").run(JSON.stringify(claims), gameId);
    return { ok: true };
  })();
}

export function resetClaims(gameId: string): void {
  db.prepare("UPDATE games SET claimed = '{}' WHERE id = ?").run(gameId);
}

// 게임 전역 마커(Vortox 영향·일식 등). 좌석 단위가 아닌 게임 전체에 걸치는 효과.
export function getGlobalMarkers(gameId: string): string[] {
  const row = db.prepare("SELECT global_markers FROM games WHERE id = ?").get(gameId) as
    | { global_markers: string }
    | undefined;
  return row?.global_markers ? (JSON.parse(row.global_markers) as string[]) : [];
}

export function toggleGlobalMarker(gameId: string, marker: string): void {
  db.transaction(() => {
    const cur = getGlobalMarkers(gameId);
    const next = cur.includes(marker) ? cur.filter((m) => m !== marker) : [...cur, marker];
    db.prepare("UPDATE games SET global_markers = ? WHERE id = ?").run(JSON.stringify(next), gameId);
  })();
}

// 미치광이용 가짜 블러핑·하수인. 진짜 데몬 정보(game.bluffs)와는 별개로 ST가 자유 지정.
export function getLunaticBluffs(gameId: string): string[] {
  const row = db.prepare("SELECT lunatic_bluffs FROM games WHERE id = ?").get(gameId) as
    | { lunatic_bluffs: string }
    | undefined;
  return row?.lunatic_bluffs ? (JSON.parse(row.lunatic_bluffs) as string[]) : [];
}

export function setLunaticBluffs(gameId: string, ids: string[]): void {
  db.prepare("UPDATE games SET lunatic_bluffs = ? WHERE id = ?").run(
    JSON.stringify(ids.slice(0, 3)),
    gameId,
  );
}

export function getLunaticMinions(gameId: string): number[] {
  const row = db.prepare("SELECT lunatic_minions FROM games WHERE id = ?").get(gameId) as
    | { lunatic_minions: string }
    | undefined;
  return row?.lunatic_minions ? (JSON.parse(row.lunatic_minions) as number[]) : [];
}

export function setLunaticMinions(gameId: string, seats: number[]): void {
  db.prepare("UPDATE games SET lunatic_minions = ? WHERE id = ?").run(
    JSON.stringify(seats),
    gameId,
  );
}

// 좌석별 가짜 직업(disguise). 미치광이/주정뱅이 본인이 폰에서 볼 화면용.
export function getDisguises(gameId: string): Record<number, string> {
  const row = db.prepare("SELECT disguises FROM games WHERE id = ?").get(gameId) as
    | { disguises: string }
    | undefined;
  if (!row?.disguises) return {};
  try {
    const obj = JSON.parse(row.disguises) as Record<string, string>;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(obj)) out[Number(k)] = v;
    return out;
  } catch {
    return {};
  }
}

export function setDisguise(gameId: string, seat: number, characterId: string): void {
  db.transaction(() => {
    const cur = getDisguises(gameId);
    if (characterId) cur[seat] = characterId;
    else delete cur[seat];
    db.prepare("UPDATE games SET disguises = ? WHERE id = ?").run(JSON.stringify(cur), gameId);
  })();
}
