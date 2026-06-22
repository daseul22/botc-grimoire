// 플레이어 개인 추측/메모 — 서버 전용. 온라인 마스킹 보드에서 each 유저가 좌석별로 직업을 추측하고
// 메모를 남긴다. user별·game별로 사적(다른 사람에게 안 보임). 페이즈와 무관(게임 단위 누적).
import { db, now } from "./games/schema";

export type SeatGuess = { guess: string; note: string };
/** target_seat = -1 은 좌석과 무관한 자유 메모(스크래치패드). */
const GENERAL_SEAT = -1;

function upsert(
  gameId: string,
  userId: number,
  seat: number,
  fields: { guess?: string; note?: string },
): void {
  const cur = db
    .prepare(
      "SELECT guess_character_id, note FROM game_player_guesses WHERE game_id = ? AND user_id = ? AND target_seat = ?",
    )
    .get(gameId, userId, seat) as { guess_character_id: string; note: string } | undefined;
  const guess = fields.guess ?? cur?.guess_character_id ?? "";
  const note = fields.note ?? cur?.note ?? "";
  db.prepare(
    `INSERT INTO game_player_guesses (game_id,user_id,target_seat,guess_character_id,note,updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(game_id,user_id,target_seat)
       DO UPDATE SET guess_character_id = excluded.guess_character_id, note = excluded.note, updated_at = excluded.updated_at`,
  ).run(gameId, userId, seat, guess, note, now());
}

export function setGuess(gameId: string, userId: number, seat: number, guessCharId: string): void {
  upsert(gameId, userId, seat, { guess: guessCharId });
}
export function setSeatNote(gameId: string, userId: number, seat: number, note: string): void {
  upsert(gameId, userId, seat, { note });
}
export function setGeneralMemo(gameId: string, userId: number, note: string): void {
  upsert(gameId, userId, GENERAL_SEAT, { note });
}

/** 한 유저의 이 게임 추측/메모 전체. seats[좌석] = {guess, note}, memo = 자유 메모. */
export function getPlayerNotes(
  gameId: string,
  userId: number,
): { seats: Record<number, SeatGuess>; memo: string } {
  const rows = db
    .prepare(
      "SELECT target_seat, guess_character_id, note FROM game_player_guesses WHERE game_id = ? AND user_id = ?",
    )
    .all(gameId, userId) as { target_seat: number; guess_character_id: string; note: string }[];
  const seats: Record<number, SeatGuess> = {};
  let memo = "";
  for (const r of rows) {
    if (r.target_seat === GENERAL_SEAT) memo = r.note;
    else seats[r.target_seat] = { guess: r.guess_character_id, note: r.note };
  }
  return { seats, memo };
}
