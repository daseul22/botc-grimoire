// 낮 투표 정산(순수) — LAN VotesSidebar와 온라인 DayConsole이 공유해 규칙 분기를 막는다.
//
// 커트라인: 처형=생존자 과반(절반 이상, 올림). 여행자 추방=생존자 과반 '초과'(floor/2+1).
// 처형으로 죽은 좌석은 그 낮 '투표 당시' 인원이므로 생존 수에 도로 포함(처형 후 커트라인이 흔들리지 않게).
import type { Character, GamePlayer, VoteRecord } from "./types";

/** 지목 대상의 커트라인 정보. 여행자는 처형이 아니라 '추방'(생존 과반 초과)이라 기준이 다르다. */
export type CutoffInfo = { value: number; word: string; tip: string };

export type Tally = {
  aliveCount: number;
  travellerCount: number;
  ghostLeft: number;
  executionCutoff: number;
  exileCutoff: number;
  highestVotes: number;
  /** 최다 득표 지목 수(동률이면 2 이상). */
  topCount: number;
  isTie: boolean;
  tieBlocks: boolean;
  leaderSeat: number | undefined;
  maxFutureVotes: number;
  canExceed: boolean;
  canTieOnly: boolean;
  hasExecuted: boolean;
  cutoffInfo: (nomineeSeat: number | "") => CutoffInfo;
};

export function computeTally(
  players: GamePlayer[],
  votes: VoteRecord[],
  charMap: Record<string, Character>,
): Tally {
  const executedSeats = new Set(votes.filter((v) => v.executed).map((v) => v.nominee));
  const alivePlayers = players.filter((p) => p.status !== "dead" || executedSeats.has(p.seat));
  const aliveCount = alivePlayers.length;
  const travellerCount = alivePlayers.filter(
    (p) => charMap[p.characterId]?.team === "traveller",
  ).length;
  const ghostLeft = players.filter((p) => p.status === "dead" && !p.ghostVoteUsed).length;

  // 처형 커트라인: 생존자 과반(올림). 여행자 추방 커트라인: 생존자 과반 '초과'.
  const executionCutoff = Math.ceil(aliveCount / 2);
  const exileCutoff = Math.floor(aliveCount / 2) + 1;
  const isTraveller = (seat: number) =>
    charMap[players.find((p) => p.seat === seat)?.characterId ?? ""]?.team === "traveller";
  const cutoffInfo = (nomineeSeat: number | ""): CutoffInfo =>
    nomineeSeat !== "" && isTraveller(nomineeSeat)
      ? { value: exileCutoff, word: "추방", tip: `여행자 추방선 ${exileCutoff}표 충족` }
      : { value: executionCutoff, word: "과반", tip: `생존 과반 ${executionCutoff}표 충족 — 단독 최다일 때만 처형` };

  // 오늘 최다 득표 + 동률 여부. 동률(2명 이상 최다)이면 룰상 아무도 처형되지 않는다.
  const highestVotes = votes.reduce((m, v) => Math.max(m, v.votes), 0);
  const topNoms = highestVotes > 0 ? votes.filter((v) => v.votes === highestVotes) : [];
  const isTie = topNoms.length >= 2;
  const tieBlocks = isTie && topNoms.some((v) => v.votes >= cutoffInfo(v.nominee).value);
  const leaderSeat = topNoms[0]?.nominee;

  // 다음 지목이 모을 수 있는 최대표 = 생존 전원(매 지목마다 다시 투표) + 남은 유령표.
  const maxFutureVotes = aliveCount + ghostLeft;
  const canExceed = maxFutureVotes > highestVotes;
  const canTieOnly = !canExceed && maxFutureVotes === highestVotes && highestVotes > 0;
  const hasExecuted = votes.some((v) => v.executed);

  return {
    aliveCount,
    travellerCount,
    ghostLeft,
    executionCutoff,
    exileCutoff,
    highestVotes,
    topCount: topNoms.length,
    isTie,
    tieBlocks,
    leaderSeat,
    maxFutureVotes,
    canExceed,
    canTieOnly,
    hasExecuted,
    cutoffInfo,
  };
}
