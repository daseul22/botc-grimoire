// 채팅 잠금 정책 — 순수 모듈(서버 강제 + 클라 UX 단일 출처).
//
// 밸런스: 귓말은 '공개토론(open) 타이머 중' + '바로 옆 좌석(양옆, 사망 무관)'에게만(귓속말 컨셉·악팀 공조 너프).
// 전챗(전체)은 낮에 가능하되 '지목·투표 중'엔 차단. 밤은 전부 차단. 이야기꾼(운영자)은 예외(호출측에서 제외).
import type { Game } from "./types";

/** 서버 판정용 게이트(발신자 기준). whisper=귓말 가능 시간대, neighborSeats=허용 대상 좌석. */
export type ChatGate = {
  allChat: boolean;
  whisper: boolean;
  neighborSeats: number[];
  reason: string;
};

/** 클라 UX용 정책. whisper='any'=제한 없음(로비·이야기꾼), 배열=이 userId에게만 귓말. */
export type ChatPolicy = {
  allChat: boolean;
  whisper: "any" | number[];
  reason: string;
};

/** 제한 없음(로비·종료 게임·이야기꾼). */
export const FREE_CHAT: ChatPolicy = { allChat: true, whisper: "any", reason: "" };

/** 공개토론(open) 타이머가 켜져 있나 — startedAt 있고 finishedAt 없음(ST가 시작~정지 사이). */
export function openTimerRunning(g: Pick<Game, "phaseTimers">): boolean {
  const t = g.phaseTimers?.open;
  return !!(t?.startedAt && !t.finishedAt);
}

/** 양옆 좌석(바로 옆, 순환 — 사망 무관). n<2면 없음. n=2면 한 명. */
export function neighborSeatsOf(seat: number | null, seatCount: number): number[] {
  if (seat == null || seatCount < 2) return [];
  return [...new Set([(seat - 1 + seatCount) % seatCount, (seat + 1) % seatCount])];
}

/**
 * 발신자 기준 채팅 게이트. 진행 중 게임에서만 호출(로비·종료 게임·이야기꾼은 호출측에서 자유 허용).
 * mySeat=발신자 좌석(관전/미배정이면 null → 귓말 불가). nominationActive=활성 지목(지목·투표 중).
 */
export function chatGate(
  phase: string,
  openRunning: boolean,
  nominationActive: boolean,
  mySeat: number | null,
  seatCount: number,
): ChatGate {
  if (phase === "night")
    return { allChat: false, whisper: false, neighborSeats: [], reason: "밤에는 대화할 수 없습니다." };
  if (nominationActive)
    return { allChat: false, whisper: false, neighborSeats: [], reason: "지목·투표 중에는 대화할 수 없습니다." };
  const neighborSeats = neighborSeatsOf(mySeat, seatCount);
  return {
    allChat: true,
    whisper: openRunning && neighborSeats.length > 0,
    neighborSeats,
    reason: openRunning ? "" : "귓말은 공개토론 시간에만 가능합니다.",
  };
}
