// 통계 — 종료된 게임에서 파생(별도 기록 테이블 없음).
// 종료 시점 데이터(닉네임/직업/진영 = game_players, 승패 = games.result, 생사 = 현재 페이즈
// 스냅샷)는 이미 DB에 영구 보존되므로, 게임 삭제·재추첨 시 통계도 자동으로 정합을 유지한다.
// 복기 링크는 /play/[id] (종료 게임이면 복기 화면으로 분기).
import { currentIdx, db, readState } from "./schema";
import { registeredNicknames } from "../auth";

// 가입 닉네임은 trim + NFC로 저장된다(lib/auth normalizeNickname). 게임 닉네임을 같은 키로
// 정규화해 비교해야 결합문자(NFD) 차이로 인한 '가입' 판정 누락이 없다.
const nickKey = (s: string) => s.trim().normalize("NFC");

export type GameStatPlayer = {
  seat: number;
  nickname: string;
  characterId: string;
  alignment: string; // 'good' | 'evil'
  status: string; // 'alive' | 'dead' (종료 시점)
  /** 이 플레이어의 진영이 승리 진영과 일치 */
  won: boolean;
};

export type FinishedGame = {
  id: string;
  label: string;
  sheetName: string;
  result: string | null; // 'good' | 'evil'
  createdAt: string;
  finishedAt: string;
  players: GameStatPlayer[];
};

type GameRow = {
  id: string;
  label: string;
  sheet_name: string;
  result: string | null;
  created_at: string;
  updated_at: string;
};
type PlayerRow = {
  seat: number;
  nickname: string;
  character_id: string;
  alignment: string;
};

/** 종료된 게임 목록 + 각 플레이어의 직업·진영·승패. 최근 종료순. */
export function listFinishedGames(): FinishedGame[] {
  const games = db
    .prepare(
      `SELECT id, label, sheet_name, result, created_at, updated_at
       FROM games WHERE status = 'finished' ORDER BY updated_at DESC`,
    )
    .all() as GameRow[];
  const playersStmt = db.prepare(
    "SELECT seat,nickname,character_id,alignment FROM game_players WHERE game_id = ? ORDER BY seat",
  );
  return games.map((g) => {
    const state = readState(g.id, currentIdx(g.id));
    const players = (playersStmt.all(g.id) as PlayerRow[]).map((p) => ({
      seat: p.seat,
      nickname: p.nickname,
      characterId: p.character_id,
      alignment: p.alignment,
      status: state[p.seat]?.status ?? "alive",
      won: !!g.result && p.alignment === g.result,
    }));
    return {
      id: g.id,
      label: g.label ?? "",
      sheetName: g.sheet_name,
      result: g.result,
      createdAt: g.created_at,
      finishedAt: g.updated_at,
      players,
    };
  });
}

export type NicknameStat = {
  nickname: string;
  games: number;
  wins: number;
  goodCount: number;
  evilCount: number;
  /** characterId → 플레이 횟수 */
  roleCounts: Record<string, number>;
  lastPlayedAt: string;
  /** 이 닉네임이 가입 유저의 닉네임인지(아니면 게스트/레거시 닉네임). */
  registered: boolean;
};

/** 종료 게임 기준 닉네임별 집계(게임수·승수·진영 분포·직업 빈도). 게임수 많은 순. */
export function nicknameLeaderboard(): NicknameStat[] {
  const finished = listFinishedGames();
  const reg = registeredNicknames();
  const map = new Map<string, NicknameStat>();
  for (const g of finished) {
    for (const p of g.players) {
      const nick = p.nickname.trim();
      if (!nick) continue;
      let s = map.get(nick);
      if (!s) {
        s = {
          nickname: nick,
          games: 0,
          wins: 0,
          goodCount: 0,
          evilCount: 0,
          roleCounts: {},
          lastPlayedAt: g.finishedAt,
          registered: reg.has(nickKey(nick)),
        };
        map.set(nick, s);
      }
      s.games += 1;
      if (p.won) s.wins += 1;
      if (p.alignment === "good") s.goodCount += 1;
      else if (p.alignment === "evil") s.evilCount += 1;
      s.roleCounts[p.characterId] = (s.roleCounts[p.characterId] ?? 0) + 1;
      if (g.finishedAt > s.lastPlayedAt) s.lastPlayedAt = g.finishedAt;
    }
  }
  // 가입 유저를 먼저, 그 안에서 게임수·승수 순.
  return [...map.values()].sort(
    (a, b) =>
      Number(b.registered) - Number(a.registered) ||
      b.games - a.games ||
      b.wins - a.wins ||
      a.nickname.localeCompare(b.nickname),
  );
}

export type NicknameGameCount = {
  /** 종료된 게임 수 — 통계 리더보드 집계 기준과 동일. */
  finished: number;
  /** 진행 중(미종료) 게임 수 — 종료되면 통계에 연결된다. */
  inProgress: number;
};

/**
 * 특정 닉네임으로 기록된 distinct 게임 수를 종료/진행으로 나눠 센다. 닉네임 변경 시
 * '이 닉네임으로 연결될/분리될 기록'을 경고하는 안전장치용. 종료 수는 통계(리더보드)와
 * 정확히 일치한다(listFinishedGames도 status='finished'만 집계). NFC로 정규화 비교.
 */
export function countGamesByNickname(nickname: string): NicknameGameCount {
  const key = nickKey(nickname);
  if (!key) return { finished: 0, inProgress: 0 };
  const rows = db
    .prepare(
      `SELECT DISTINCT p.game_id AS game_id, p.nickname AS nickname, g.status AS status
       FROM game_players p JOIN games g ON g.id = p.game_id
       WHERE TRIM(p.nickname) <> ''`,
    )
    .all() as { game_id: string; nickname: string; status: string }[];
  const fin = new Set<string>();
  const prog = new Set<string>();
  for (const r of rows) {
    if (nickKey(r.nickname) !== key) continue;
    if (r.status === "finished") fin.add(r.game_id);
    else prog.add(r.game_id);
  }
  return { finished: fin.size, inProgress: prog.size };
}

export type KnownNickname = {
  nickname: string;
  count: number;
  lastSeen: string;
  /** 가입 유저의 닉네임인지. */
  registered: boolean;
};

/**
 * 자동완성용 — 모든 게임(진행/종료 무관)에서 입력된 적 있는 닉네임 + 가입 유저 닉네임.
 * 가입 유저 우선 → 자주 쓴 순 → 최근 순. 게임 기록이 없는 가입 유저도 포함된다.
 */
export function listKnownNicknames(): KnownNickname[] {
  const hist = db
    .prepare(
      `SELECT TRIM(p.nickname) AS nickname, COUNT(*) AS count, MAX(g.created_at) AS lastSeen
       FROM game_players p JOIN games g ON g.id = p.game_id
       WHERE TRIM(p.nickname) <> ''
       GROUP BY TRIM(p.nickname)`,
    )
    .all() as { nickname: string; count: number; lastSeen: string }[];
  const reg = registeredNicknames();
  const map = new Map<string, KnownNickname>();
  for (const h of hist)
    map.set(h.nickname, {
      nickname: h.nickname,
      count: h.count,
      lastSeen: h.lastSeen ?? "",
      registered: reg.has(nickKey(h.nickname)),
    });
  // 게임 기록이 없는 가입 유저도 후보에 포함.
  for (const nick of reg)
    if (!map.has(nick)) map.set(nick, { nickname: nick, count: 0, lastSeen: "", registered: true });
  return [...map.values()].sort(
    (a, b) =>
      Number(b.registered) - Number(a.registered) ||
      b.count - a.count ||
      b.lastSeen.localeCompare(a.lastSeen),
  );
}
