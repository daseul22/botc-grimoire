import { getDb } from "./db";
import { keepMarkerOnAdvance, parseMarker } from "./markers";
import type { Game, GamePlayer, NightActionRecord, VoteRecord } from "./types";

// 서버 전용. 게임 상태는 가변 데이터 → seed가 건드리지 않는 별도 테이블.
//
// 스냅샷 모델: 플레이어 정체성/배치(game_players)는 전역(페이즈 무관),
// 상태(생존/마커)는 페이즈별 독립 스냅샷(game_phases)으로 저장한다.
// games.current_idx 가 현재 보고 있는 스냅샷을 가리킨다. 과거 페이즈로 돌아가
// 수정해도 다른 페이즈에 영향을 주지 않는다(cascade 없음).
const db = getDb();
db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'playing',
  phase TEXT,
  day INTEGER NOT NULL DEFAULT 1,
  result TEXT,
  config TEXT,
  current_idx INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_players (
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  character_id TEXT NOT NULL,
  alignment TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0.5,
  y REAL NOT NULL DEFAULT 0.5,
  locked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'alive',
  markers TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (game_id, seat)
);
CREATE TABLE IF NOT EXISTS game_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  phase TEXT,
  day INTEGER,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_phases (
  game_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  day INTEGER NOT NULL,
  phase TEXT NOT NULL,
  state TEXT NOT NULL,
  PRIMARY KEY (game_id, idx)
);
CREATE TABLE IF NOT EXISTS game_phase_actions (
  game_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  actions TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (game_id, idx)
);
`);
// 구버전 db 컬럼 보강 (idempotent)
for (const sql of [
  "ALTER TABLE games ADD COLUMN config TEXT",
  "ALTER TABLE games ADD COLUMN current_idx INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE game_players ADD COLUMN memo TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE games ADD COLUMN bluffs TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE game_players ADD COLUMN ghost_vote_used INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE game_phases ADD COLUMN votes TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE game_phases ADD COLUMN note TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE game_phases ADD COLUMN done TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN claimed TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN global_markers TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN lunatic_bluffs TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN lunatic_minions TEXT NOT NULL DEFAULT '[]'",
]) {
  try {
    db.exec(sql);
  } catch {
    /* 이미 존재 */
  }
}

const now = () => new Date().toISOString();

type SeatState = { status: string; markers: string[]; cause?: string };
type StateMap = Record<number, SeatState>;

function stateFromList(
  players: { seat: number; status?: string; markers?: string[] }[],
): StateMap {
  const s: StateMap = {};
  for (const p of players)
    s[p.seat] = { status: p.status ?? "alive", markers: p.markers ?? [] };
  return s;
}

// 구버전 게임(game_log 기반)을 스냅샷 모델로 1회 이관
(function migrate() {
  const games = db.prepare("SELECT id, phase, day FROM games").all() as {
    id: string;
    phase: string | null;
    day: number;
  }[];
  const hasPhase = db.prepare("SELECT 1 FROM game_phases WHERE game_id = ? LIMIT 1");
  const insPhase = db.prepare(
    "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,?,?,?,?)",
  );
  for (const g of games) {
    if (hasPhase.get(g.id)) continue;
    const logs = db
      .prepare("SELECT phase,day,data FROM game_log WHERE game_id = ? ORDER BY seq")
      .all(g.id) as { phase: string | null; day: number; data: string }[];
    const cur = db
      .prepare("SELECT seat,status,markers FROM game_players WHERE game_id = ?")
      .all(g.id) as { seat: number; status: string; markers: string }[];
    db.transaction(() => {
      let idx = 0;
      for (const lg of logs) {
        const players = (JSON.parse(lg.data).players ?? []) as SeatState[] &
          { seat: number }[];
        insPhase.run(g.id, idx++, lg.day ?? 1, lg.phase ?? "night", JSON.stringify(stateFromList(players)));
      }
      const curState: StateMap = {};
      for (const p of cur)
        curState[p.seat] = { status: p.status, markers: JSON.parse(p.markers) };
      insPhase.run(g.id, idx, g.day ?? 1, g.phase ?? "night", JSON.stringify(curState));
      db.prepare("UPDATE games SET current_idx = ? WHERE id = ?").run(idx, g.id);
    })();
  }
})();

type GameRow = {
  id: string;
  sheet_id: string;
  sheet_name: string;
  status: string;
  result: string | null;
  config: string | null;
  current_idx: number;
  bluffs: string | null;
};
type PlayerRow = {
  seat: number;
  nickname: string;
  character_id: string;
  alignment: string;
  x: number;
  y: number;
  locked: number;
  memo: string;
  ghost_vote_used: number;
};

export type GameConfig = { excludedIds: string[]; counts: Record<string, number> };
export type NewPlayer = Omit<
  GamePlayer,
  "locked" | "status" | "markers" | "memo" | "deathCause" | "ghostVoteUsed"
>;
export type RoleAssignment = { seat: number; characterId: string; alignment: string };

function phaseCount(gameId: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS c FROM game_phases WHERE game_id = ?").get(gameId) as {
      c: number;
    }
  ).c;
}
function currentIdx(gameId: string): number {
  return (
    (db.prepare("SELECT current_idx FROM games WHERE id = ?").get(gameId) as
      | { current_idx: number }
      | undefined)?.current_idx ?? 0
  );
}
function readState(gameId: string, idx: number): StateMap {
  const row = db
    .prepare("SELECT state FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { state: string } | undefined;
  return row ? (JSON.parse(row.state) as StateMap) : {};
}
function writeState(gameId: string, idx: number, state: StateMap): void {
  db.prepare("UPDATE game_phases SET state = ? WHERE game_id = ? AND idx = ?").run(
    JSON.stringify(state),
    gameId,
    idx,
  );
}

function readActions(gameId: string, idx: number): NightActionRecord[] {
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

function readVotes(gameId: string, idx: number): VoteRecord[] {
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

/** 유령표 사용 토글 (전역) */
export function setGhostVote(gameId: string, seat: number, used: boolean): void {
  db.prepare(
    "UPDATE game_players SET ghost_vote_used = ? WHERE game_id = ? AND seat = ?",
  ).run(used ? 1 : 0, gameId, seat);
}

function readDone(gameId: string, idx: number): number[] {
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

function readNote(gameId: string, idx: number): string {
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

function readPlayers(gameId: string, idx: number): GamePlayer[] {
  const state = readState(gameId, idx);
  return (
    db
      .prepare(
        "SELECT seat,nickname,character_id,alignment,x,y,locked,memo,ghost_vote_used FROM game_players WHERE game_id = ? ORDER BY seat",
      )
      .all(gameId) as PlayerRow[]
  ).map((r) => ({
    seat: r.seat,
    nickname: r.nickname,
    characterId: r.character_id,
    alignment: r.alignment as GamePlayer["alignment"],
    x: r.x,
    y: r.y,
    locked: !!r.locked,
    status: state[r.seat]?.status ?? "alive",
    markers: state[r.seat]?.markers ?? [],
    memo: r.memo ?? "",
    deathCause: state[r.seat]?.cause ?? "",
    ghostVoteUsed: !!r.ghost_vote_used,
  }));
}

export function getGame(id: string): Game | undefined {
  const g = db.prepare("SELECT * FROM games WHERE id = ?").get(id) as
    | GameRow
    | undefined;
  if (!g) return undefined;
  const idx = g.current_idx ?? 0;
  const ph = db
    .prepare("SELECT day,phase FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(id, idx) as { day: number; phase: string } | undefined;
  return {
    id: g.id,
    sheetId: g.sheet_id,
    sheetName: g.sheet_name,
    status: g.status,
    phase: ph?.phase ?? "night",
    day: ph?.day ?? 1,
    result: g.result,
    phaseIndex: idx,
    phaseCount: phaseCount(id),
    players: readPlayers(id, idx),
    actions: readActions(id, idx),
    votes: readVotes(id, idx),
    bluffs: g.bluffs ? (JSON.parse(g.bluffs) as string[]) : [],
    doneSeats: readDone(id, idx),
    note: readNote(id, idx),
    globalMarkers: getGlobalMarkers(id),
    lunaticBluffs: getLunaticBluffs(id),
    lunaticMinions: getLunaticMinions(id),
  };
}

export function getGameConfig(
  id: string,
): (GameConfig & { sheetId: string }) | undefined {
  const g = db.prepare("SELECT sheet_id, config FROM games WHERE id = ?").get(id) as
    | { sheet_id: string; config: string | null }
    | undefined;
  if (!g) return undefined;
  const cfg = (g.config ? JSON.parse(g.config) : { excludedIds: [], counts: {} }) as GameConfig;
  return { sheetId: g.sheet_id, excludedIds: cfg.excludedIds ?? [], counts: cfg.counts ?? {} };
}

export function createGame(input: {
  sheetId: string;
  sheetName: string;
  config: GameConfig;
  players: NewPlayer[];
}): string {
  const id = "g-" + crypto.randomUUID().slice(0, 8);
  const t = now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO games (id,sheet_id,sheet_name,status,phase,day,result,config,current_idx,created_at,updated_at)
       VALUES (?,?,?,'playing','night',1,NULL,?,0,?,?)`,
    ).run(id, input.sheetId, input.sheetName, JSON.stringify(input.config), t, t);
    const insPlayer = db.prepare(
      `INSERT INTO game_players (game_id,seat,nickname,character_id,alignment,x,y)
       VALUES (?,?,?,?,?,?,?)`,
    );
    const state: StateMap = {};
    for (const p of input.players) {
      insPlayer.run(id, p.seat, p.nickname, p.characterId, p.alignment, p.x, p.y);
      state[p.seat] = { status: "alive", markers: [] };
    }
    db.prepare(
      "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,0,1,'night',?)",
    ).run(id, JSON.stringify(state));
  })();
  return id;
}

/** 재추첨: 좌석/닉네임/위치는 유지하고 직업·진영만 교체 + 진행상태 전체 초기화 */
export function redrawRoles(gameId: string, roles: RoleAssignment[]): void {
  db.transaction(() => {
    const upd = db.prepare(
      "UPDATE game_players SET character_id = ?, alignment = ? WHERE game_id = ? AND seat = ?",
    );
    for (const r of roles) upd.run(r.characterId, r.alignment, gameId, r.seat);
    db.prepare("DELETE FROM game_phases WHERE game_id = ?").run(gameId);
    db.prepare("DELETE FROM game_phase_actions WHERE game_id = ?").run(gameId);
    const seats = db
      .prepare("SELECT seat FROM game_players WHERE game_id = ?")
      .all(gameId) as { seat: number }[];
    const state: StateMap = {};
    for (const s of seats) state[s.seat] = { status: "alive", markers: [] };
    db.prepare(
      "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,0,1,'night',?)",
    ).run(gameId, JSON.stringify(state));
    db.prepare("UPDATE game_players SET ghost_vote_used = 0 WHERE game_id = ?").run(gameId);
    db.prepare(
      "UPDATE games SET current_idx = 0, status = 'playing', result = NULL, bluffs = '[]', claimed = '[]', global_markers = '[]', lunatic_bluffs = '[]', lunatic_minions = '[]', updated_at = ? WHERE id = ?",
    ).run(now(), gameId);
  })();
}

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
  // 같은 마커면 해제, 아니면 동일 base 제거 후 추가(집착 대상 교체 등)
  const markers = cur.includes(markerId)
    ? cur.filter((m) => m !== markerId)
    : [...cur.filter((m) => parseMarker(m).base !== base), markerId];
  s[seat] = { status: s[seat]?.status ?? "alive", markers };
  writeState(gameId, idx, s);
}

/**
 * 다음 페이즈로. 이미 뒤에 스냅샷이 있으면(과거로 갔다가 진행) 포인터만 이동,
 * 최신이면 현재를 복사해 새 스냅샷 생성(일시 마커 제거 + 밤↔낮/일차 계산).
 */
export function advancePhase(gameId: string): void {
  const idx = currentIdx(gameId);
  const total = phaseCount(gameId);
  if (idx < total - 1) {
    db.prepare("UPDATE games SET current_idx = ?, updated_at = ? WHERE id = ?").run(
      idx + 1,
      now(),
      gameId,
    );
    return;
  }
  const cur = db
    .prepare("SELECT day,phase,state FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { day: number; phase: string; state: string };
  const leavingDay = cur.phase === "day"; // 낮 종료 = 황혼 통과
  const nextPhase = cur.phase === "night" ? "day" : "night";
  const nextDay = leavingDay ? cur.day + 1 : cur.day;
  const state = JSON.parse(cur.state) as StateMap;
  const next: StateMap = {};
  // 자동 변절(메제펠리스 단어 발화): 낮→밤 전환 시 turning 마커가 있는 좌석은 alignment=evil로 변경.
  const turningSeats: number[] = [];
  for (const seat of Object.keys(state)) {
    const k = Number(seat);
    const seatMarkers = state[k].markers;
    if (leavingDay && seatMarkers.some((m) => parseMarker(m).base === "turning")) {
      turningSeats.push(k);
    }
    next[k] = {
      status: state[k].status,
      markers: seatMarkers.filter((m) => keepMarkerOnAdvance(m, leavingDay)),
    };
  }
  db.transaction(() => {
    db.prepare(
      "INSERT INTO game_phases (game_id,idx,day,phase,state) VALUES (?,?,?,?,?)",
    ).run(gameId, idx + 1, nextDay, nextPhase, JSON.stringify(next));
    if (turningSeats.length) {
      const upd = db.prepare(
        "UPDATE game_players SET alignment = 'evil' WHERE game_id = ? AND seat = ?",
      );
      for (const s of turningSeats) upd.run(gameId, s);
    }
    db.prepare("UPDATE games SET current_idx = ?, updated_at = ? WHERE id = ?").run(
      idx + 1,
      now(),
      gameId,
    );
  })();
}

/** 이전 페이즈로 (포인터만 이동, 각 스냅샷은 독립 유지) */
export function prevPhase(gameId: string): void {
  const idx = currentIdx(gameId);
  if (idx > 0)
    db.prepare("UPDATE games SET current_idx = ?, updated_at = ? WHERE id = ?").run(
      idx - 1,
      now(),
      gameId,
    );
}

export function finishGame(gameId: string, result: string): void {
  db.prepare(
    "UPDATE games SET status = 'finished', result = ?, updated_at = ? WHERE id = ?",
  ).run(result, now(), gameId);
}

export type HistoryPlayer = {
  seat: number;
  nickname: string;
  characterId: string;
  alignment: string;
  status: string;
  markers: string[];
  deathCause: string;
};
export type HistoryEntry = {
  idx: number;
  phase: string;
  day: number;
  players: HistoryPlayer[];
  actions: NightActionRecord[];
  votes: VoteRecord[];
};

export function getHistory(gameId: string): HistoryEntry[] {
  const ids = db
    .prepare(
      "SELECT seat,nickname,character_id,alignment FROM game_players WHERE game_id = ? ORDER BY seat",
    )
    .all(gameId) as {
    seat: number;
    nickname: string;
    character_id: string;
    alignment: string;
  }[];
  const phases = db
    .prepare("SELECT idx,day,phase,state FROM game_phases WHERE game_id = ? ORDER BY idx")
    .all(gameId) as { idx: number; day: number; phase: string; state: string }[];
  return phases.map((ph) => {
    const state = JSON.parse(ph.state) as StateMap;
    return {
      idx: ph.idx,
      day: ph.day,
      phase: ph.phase,
      actions: readActions(gameId, ph.idx),
      votes: readVotes(gameId, ph.idx),
      players: ids.map((p) => ({
        seat: p.seat,
        nickname: p.nickname,
        characterId: p.character_id,
        alignment: p.alignment,
        status: state[p.seat]?.status ?? "alive",
        markers: state[p.seat]?.markers ?? [],
        deathCause: state[p.seat]?.cause ?? "",
      })),
    };
  });
}

export type GameSummary = {
  id: string;
  sheetName: string;
  status: string;
  day: number;
  phase: string | null;
  result: string | null;
  playerCount: number;
  createdAt: string;
};

export function listGames(): GameSummary[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.sheet_name AS sheetName, g.status, g.result, g.current_idx AS currentIdx,
              g.created_at AS createdAt,
              (SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id) AS playerCount
       FROM games g ORDER BY g.created_at DESC`,
    )
    .all() as (Omit<GameSummary, "day" | "phase"> & { currentIdx: number })[];
  const ph = db.prepare(
    "SELECT day,phase FROM game_phases WHERE game_id = ? AND idx = ?",
  );
  return rows.map((r) => {
    const p = ph.get(r.id, r.currentIdx) as { day: number; phase: string } | undefined;
    return {
      id: r.id,
      sheetName: r.sheetName,
      status: r.status,
      day: p?.day ?? 1,
      phase: p?.phase ?? null,
      result: r.result,
      playerCount: r.playerCount,
      createdAt: r.createdAt,
    };
  });
}

export function deleteGame(id: string): void {
  db.transaction(() => {
    db.prepare("DELETE FROM game_players WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_log WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_phases WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM game_phase_actions WHERE game_id = ?").run(id);
    db.prepare("DELETE FROM games WHERE id = ?").run(id);
  })();
}
