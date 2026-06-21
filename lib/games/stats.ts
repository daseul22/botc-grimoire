// 통계 — 종료된 게임에서 파생(별도 기록 테이블 없음).
// 종료 시점 데이터(닉네임/직업/진영 = game_players, 승패 = games.result, 생사 = 현재 페이즈
// 스냅샷)는 이미 DB에 영구 보존되므로, 게임 삭제·재추첨 시 통계도 자동으로 정합을 유지한다.
//
// 집계 단위: game_players.user_id(가입 계정)가 있으면 '계정' 기준, 없으면 닉네임(게스트) 기준.
// 닉네임은 계정의 현재 닉네임으로 표시되므로, 닉네임을 바꿔도 전적이 계정을 따라간다.
// 복기 링크는 /play/[id] (종료 게임이면 복기 화면으로 분기).
import { currentIdx, db, readState } from "./schema";
import { userNicknamesById } from "../auth";

// 가입 닉네임은 trim + NFC로 저장된다(lib/auth normalizeNickname). 게임 닉네임을 같은 키로
// 정규화해 비교해야 결합문자(NFD) 차이로 인한 매칭 누락이 없다.
const nickKey = (s: string) => s.trim().normalize("NFC");

export type GameStatPlayer = {
  seat: number;
  nickname: string;
  characterId: string;
  alignment: string; // 'good' | 'evil'
  status: string; // 'alive' | 'dead' (종료 시점)
  /** 좌석 점유자의 가입 계정 id(없으면 게스트). */
  userId: number | null;
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
  user_id: number | null;
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
    "SELECT seat,nickname,character_id,alignment,user_id FROM game_players WHERE game_id = ? ORDER BY seat",
  );
  return games.map((g) => {
    const state = readState(g.id, currentIdx(g.id));
    const players = (playersStmt.all(g.id) as PlayerRow[]).map((p) => ({
      seat: p.seat,
      nickname: p.nickname,
      characterId: p.character_id,
      alignment: p.alignment,
      status: state[p.seat]?.status ?? "alive",
      userId: p.user_id ?? null,
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
  /** 가입 계정 기준 집계인지(아니면 게스트 닉네임). */
  registered: boolean;
};

/**
 * 종료 게임 기준 집계(게임수·승수·진영 분포·직업 빈도). 가입 계정은 user_id로 묶고
 * 현재 닉네임으로 표시(닉네임 변경 시 전적이 계정을 따라감), 게스트는 닉네임으로 묶는다.
 */
export function nicknameLeaderboard(): NicknameStat[] {
  const finished = listFinishedGames();
  const userNick = userNicknamesById();
  const map = new Map<string, NicknameStat>();
  for (const g of finished) {
    for (const p of g.players) {
      const registered = p.userId != null;
      const key = registered ? `u:${p.userId}` : `g:${nickKey(p.nickname)}`;
      const display = registered ? userNick.get(p.userId!) ?? p.nickname.trim() : p.nickname.trim();
      if (!display) continue;
      let s = map.get(key);
      if (!s) {
        s = {
          nickname: display,
          games: 0,
          wins: 0,
          goodCount: 0,
          evilCount: 0,
          roleCounts: {},
          lastPlayedAt: g.finishedAt,
          registered,
        };
        map.set(key, s);
      }
      s.nickname = display; // 계정은 항상 현재 닉네임으로
      s.games += 1;
      if (p.won) s.wins += 1;
      if (p.alignment === "good") s.goodCount += 1;
      else if (p.alignment === "evil") s.evilCount += 1;
      s.roleCounts[p.characterId] = (s.roleCounts[p.characterId] ?? 0) + 1;
      if (g.finishedAt > s.lastPlayedAt) s.lastPlayedAt = g.finishedAt;
    }
  }
  // 가입 계정을 먼저, 그 안에서 게임수·승수 순.
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
 * 특정 닉네임으로 기록된 '게스트(user_id 없음)' distinct 게임 수를 종료/진행으로 나눠 센다.
 * 닉네임 변경 시 그 이름으로 내 계정에 새로 흡수될 게임을 경고하는 안전장치용
 * (이미 다른 계정에 묶인 기록은 흡수되지 않으므로 제외). NFC 정규화 비교.
 */
export function countGuestGamesByNickname(nickname: string): NicknameGameCount {
  const key = nickKey(nickname);
  if (!key) return { finished: 0, inProgress: 0 };
  const rows = db
    .prepare(
      `SELECT DISTINCT p.game_id AS game_id, p.nickname AS nickname, g.status AS status
       FROM game_players p JOIN games g ON g.id = p.game_id
       WHERE p.user_id IS NULL AND TRIM(p.nickname) <> ''`,
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

/**
 * 게스트(user_id 없음) 좌석 중 닉네임이 일치하는 행을 한 계정에 바인딩한다. 반환=바인딩된 좌석 수.
 * 가입(기존 게스트 기록 연동)·닉네임 변경(새 이름의 게스트 기록 흡수) 시 호출. 이미 계정에 묶인
 * 행은 건드리지 않는다(다른 계정의 기록을 빼앗지 않음).
 */
export function linkGuestGamesToUser(userId: number, nickname: string): number {
  const key = nickKey(nickname);
  if (!key) return 0;
  const rows = db
    .prepare("SELECT game_id, seat, nickname FROM game_players WHERE user_id IS NULL")
    .all() as { game_id: string; seat: number; nickname: string }[];
  const upd = db.prepare("UPDATE game_players SET user_id = ? WHERE game_id = ? AND seat = ?");
  let n = 0;
  db.transaction(() => {
    for (const r of rows)
      if (nickKey(r.nickname) === key) {
        upd.run(userId, r.game_id, r.seat);
        n++;
      }
  })();
  return n;
}

export type KnownNickname = {
  nickname: string;
  count: number;
  lastSeen: string;
  /** 가입 유저의 닉네임인지. */
  registered: boolean;
};

/**
 * 자동완성용 — 가입 유저(현재 닉네임) + 게스트 닉네임(user_id 없는 좌석). 가입 우선 → 자주 쓴 순.
 * 가입 유저는 게임 기록이 없어도 포함된다.
 */
export function listKnownNicknames(): KnownNickname[] {
  const userNick = userNicknamesById();
  const userAgg = new Map(
    (
      db
        .prepare(
          `SELECT p.user_id AS uid, COUNT(*) AS count, MAX(g.created_at) AS lastSeen
           FROM game_players p JOIN games g ON g.id = p.game_id
           WHERE p.user_id IS NOT NULL GROUP BY p.user_id`,
        )
        .all() as { uid: number; count: number; lastSeen: string }[]
    ).map((r) => [r.uid, r]),
  );
  const out: KnownNickname[] = [];
  for (const [uid, nick] of userNick) {
    const a = userAgg.get(uid);
    out.push({ nickname: nick, count: a?.count ?? 0, lastSeen: a?.lastSeen ?? "", registered: true });
  }
  const regKeys = new Set([...userNick.values()].map(nickKey));
  const guestRows = db
    .prepare(
      `SELECT TRIM(p.nickname) AS nickname, COUNT(*) AS count, MAX(g.created_at) AS lastSeen
       FROM game_players p JOIN games g ON g.id = p.game_id
       WHERE p.user_id IS NULL AND TRIM(p.nickname) <> ''
       GROUP BY TRIM(p.nickname)`,
    )
    .all() as { nickname: string; count: number; lastSeen: string }[];
  for (const r of guestRows) {
    if (regKeys.has(nickKey(r.nickname))) continue; // 가입자와 겹치는 이름은 가입 항목으로 충분
    out.push({ nickname: r.nickname, count: r.count, lastSeen: r.lastSeen ?? "", registered: false });
  }
  return out.sort(
    (a, b) =>
      Number(b.registered) - Number(a.registered) ||
      b.count - a.count ||
      b.lastSeen.localeCompare(a.lastSeen),
  );
}
