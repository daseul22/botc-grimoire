import { getDb } from "../db";
import type { DeathCause, SeatStatus } from "../types";

// 서버 전용. 게임 상태는 가변 데이터 → seed가 건드리지 않는 별도 테이블.
//
// 스냅샷 모델: 플레이어 정체성/배치(game_players)는 전역(페이즈 무관),
// 상태(생존/마커)는 페이즈별 독립 스냅샷(game_phases)으로 저장한다.
// games.current_idx 가 현재 보고 있는 스냅샷을 가리킨다. 과거 페이즈로 돌아가
// 수정해도 다른 페이즈에 영향을 주지 않는다(cascade 없음).
export const db = getDb();
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
CREATE TABLE IF NOT EXISTS game_undo_stack (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  label TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- ── 온라인 플레이(원격 멀티플레이어) ──
-- 게임은 시작 순간에 만들어진다(기존 createGame). 그 전 "로비"를 담는 게 game_rooms.
-- 로비에서 가입자가 모이고 좌석이 배정되면, 시작 시 createGame을 호출해 game_id를 연결한다.
CREATE TABLE IF NOT EXISTS game_rooms (
  id TEXT PRIMARY KEY,                    -- 'r-xxxxxxxx'
  code TEXT NOT NULL UNIQUE,              -- 공유용 짧은 입장 코드
  owner_id INTEGER NOT NULL,             -- 이야기꾼(방장) user id
  sheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby',  -- 'lobby' | 'started' | 'closed'
  game_id TEXT,                          -- 시작되면 연결되는 games.id
  config TEXT,                           -- 시작 직전 비율/제외 설정 스냅샷(JSON)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_room_members (
  room_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  nickname TEXT NOT NULL,                -- 가입 시점 닉네임 스냅샷(표시용)
  role TEXT NOT NULL DEFAULT 'player',   -- 'storyteller' | 'player' | 'spectator'
  seat INTEGER,                          -- 배정 좌석(null=미배정/관전)
  joined_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS game_invites (
  id TEXT PRIMARY KEY,                    -- 'i-xxxxxxxx' (초대 토큰)
  room_id TEXT NOT NULL,
  invited_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined'
  created_at TEXT NOT NULL,
  UNIQUE (room_id, invited_user_id)
);
-- 플레이어 개인 추측/메모(온라인 마스킹 보드). user별·game별·좌석별. target_seat=-1 은 자유 메모.
CREATE TABLE IF NOT EXISTS game_player_guesses (
  game_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  target_seat INTEGER NOT NULL,
  guess_character_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (game_id, user_id, target_seat)
);
-- 룸 채팅(로비~게임 지속). room 단위. nickname은 발신 시점 스냅샷.
-- recipient_user_id: null=전체채팅, 값=귓말(발신자·수신자·이야기꾼만 열람).
CREATE TABLE IF NOT EXISTS game_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  body TEXT NOT NULL,
  recipient_user_id INTEGER,
  recipient_nickname TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_messages_room ON game_messages(room_id, id);
-- 밤 행동 요청/응답 핸드셰이크(온라인). 이야기꾼↔플레이어 좌석 단위.
-- status: awaiting(플레이어 행동) → responded(ST 정산) → delivered(플레이어 확인) → done. info는 바로 delivered.
CREATE TABLE IF NOT EXISTS game_night_requests (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  idx INTEGER NOT NULL DEFAULT 0,           -- 소속 페이즈 스냅샷(current_idx). 페이즈별 요청 격리 — 지난 밤 요청이 다음 밤 행에 새지 않도록.
  kind TEXT NOT NULL,                       -- 'info' | 'pick-players' | 'pick-character'
  prompt TEXT NOT NULL DEFAULT '',
  max_targets INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'awaiting',
  player_targets TEXT NOT NULL DEFAULT '[]',
  player_choice TEXT NOT NULL DEFAULT '',
  info_payload TEXT,                        -- JSON { heading, subheading, roleTokens:[charId], nameTokens:[nickname] }
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_night_requests_game ON game_night_requests(game_id, seat);
-- 낮 지목·투표(온라인, 시계바늘 순차). committed VoteRecord(game_phases.votes)와 별개인 라이브 레이어.
-- status: pending(시작 전) → voting(스윕 중) → tallied(집계 완료) → committed(VoteRecord로 확정) / cancelled.
CREATE TABLE IF NOT EXISTS game_nominations (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  day INTEGER NOT NULL,                     -- 소속 낮(day 번호가 각 낮을 유일 식별 → 오래된 지목 격리)
  nominator_seat INTEGER NOT NULL,
  nominee_seat INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  order_json TEXT NOT NULL DEFAULT '[]',    -- 투표 순서 좌석 배열(지명자 다음부터 시계방향, 마지막이 지명자)
  pointer INTEGER NOT NULL DEFAULT -1,      -- order_json 인덱스(현재 투표 좌석). -1=시작 전
  step INTEGER NOT NULL DEFAULT 0,          -- advance CAS 가드(단조 증가) — 중복 자동 advance 무해화
  per_seat_sec INTEGER NOT NULL DEFAULT 0,  -- 좌석당 제한시간. 0=수동(ST가 ▶다음)
  turn_started_at TEXT,                     -- 현재 턴 시작 ISO(일시정지/비투표 시 null)
  paused INTEGER NOT NULL DEFAULT 0,
  is_exile INTEGER NOT NULL DEFAULT 0,      -- 여행자 추방(처형과 다른 규칙): 전원 투표·유령표 무소모·추방선(과반 초과)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nominations_game ON game_nominations(game_id, day);
-- 각 좌석의 손(공개 정보). nomination별 좌석당 1행 — JSON blob 대신 행 단위로 동시 쓰기 레이스 방지.
CREATE TABLE IF NOT EXISTS game_nomination_hands (
  nomination_id TEXT NOT NULL,
  voter_seat INTEGER NOT NULL,
  hand INTEGER NOT NULL DEFAULT 0,          -- 0 down / 1 up
  is_ghost INTEGER NOT NULL DEFAULT 0,      -- 죽은 좌석이 유령표를 소모하며 든 손
  PRIMARY KEY (nomination_id, voter_seat)
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
  "ALTER TABLE games ADD COLUMN disguises TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE game_phases ADD COLUMN timers TEXT NOT NULL DEFAULT '{}'",
  // 낮 지목 받기 활성화(ST가 열어야 플레이어가 지목 가능). 페이즈 스냅샷별 → 매 낮 자동 리셋(off).
  "ALTER TABLE game_phases ADD COLUMN nominations_open INTEGER NOT NULL DEFAULT 0",
  // 밤 요청을 소속 페이즈 스냅샷(current_idx)으로 격리 — 지난 밤의 delivered 요청이 다음 밤 행에 뱃지로 새던 버그 방지.
  "ALTER TABLE game_night_requests ADD COLUMN idx INTEGER NOT NULL DEFAULT 0",
  // 여행자 추방 지목 — 처형과 다른 규칙(전원 투표·유령표 무소모·추방선). 기존 지목은 처형(0)으로 귀속.
  "ALTER TABLE game_nominations ADD COLUMN is_exile INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE games ADD COLUMN label TEXT NOT NULL DEFAULT ''",
  // 인증 도입: 게임을 시작한 이야기꾼(소유자). 레거시 게임은 null(진행 중이면 관리자만 열람).
  "ALTER TABLE games ADD COLUMN owner_id INTEGER",
  // 좌석 점유자의 가입 계정 id(안정적). 닉네임이 아니라 계정에 통계가 묶이도록.
  // null = 게스트(미가입 닉네임). 닉네임을 바꿔도 user_id는 유지돼 전적이 계정을 따라간다.
  "ALTER TABLE game_players ADD COLUMN user_id INTEGER",
  // 귓말: 수신자(있으면 귓말). 발신자·수신자·이야기꾼만 열람.
  "ALTER TABLE game_messages ADD COLUMN recipient_user_id INTEGER",
  "ALTER TABLE game_messages ADD COLUMN recipient_nickname TEXT NOT NULL DEFAULT ''",
  // 플레이어 닉네임 구분 색(이야기꾼 지정). ''=미지정(표시 시 userId로 폴백).
  "ALTER TABLE game_room_members ADD COLUMN color TEXT NOT NULL DEFAULT ''",
]) {
  try {
    db.exec(sql);
  } catch {
    /* 이미 존재 */
  }
}

export const now = () => new Date().toISOString();

export type SeatState = { status: SeatStatus; markers: string[]; cause?: DeathCause };
export type StateMap = Record<number, SeatState>;

export function stateFromList(
  players: { seat: number; status?: SeatStatus; markers?: string[] }[],
): StateMap {
  const s: StateMap = {};
  for (const p of players)
    s[p.seat] = { status: p.status ?? "alive", markers: p.markers ?? [] };
  return s;
}

/**
 * 한 좌석의 스냅샷 상태를 부분 갱신 — patch에 없는 필드(특히 cause)는 보존한다.
 * 마커만 토글하면서 사망 원인(cause)을 실수로 지우는 버그를 구조적으로 막는다.
 */
export function mutateSeat(state: StateMap, seat: number, patch: Partial<SeatState>): void {
  const cur = state[seat] ?? { status: "alive" as SeatStatus, markers: [] };
  state[seat] = { ...cur, ...patch };
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
      .all(g.id) as { seat: number; status: SeatStatus; markers: string }[];
    db.transaction(() => {
      let idx = 0;
      for (const lg of logs) {
        const players = (JSON.parse(lg.data).players ?? []) as {
          seat: number;
          status?: SeatStatus;
          markers?: string[];
        }[];
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

export type GameRow = {
  id: string;
  sheet_id: string;
  sheet_name: string;
  label: string;
  status: string;
  result: string | null;
  config: string | null;
  current_idx: number;
  bluffs: string | null;
};
export type PlayerRow = {
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

export function phaseCount(gameId: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS c FROM game_phases WHERE game_id = ?").get(gameId) as {
      c: number;
    }
  ).c;
}
export function currentIdx(gameId: string): number {
  return (
    (db.prepare("SELECT current_idx FROM games WHERE id = ?").get(gameId) as
      | { current_idx: number }
      | undefined)?.current_idx ?? 0
  );
}
export function readState(gameId: string, idx: number): StateMap {
  const row = db
    .prepare("SELECT state FROM game_phases WHERE game_id = ? AND idx = ?")
    .get(gameId, idx) as { state: string } | undefined;
  return row ? (JSON.parse(row.state) as StateMap) : {};
}
export function writeState(gameId: string, idx: number, state: StateMap): void {
  db.prepare("UPDATE game_phases SET state = ? WHERE game_id = ? AND idx = ?").run(
    JSON.stringify(state),
    gameId,
    idx,
  );
}
