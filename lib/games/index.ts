// 게임 모듈 허브 — "@/lib/games" 경로는 이 폴더의 index로 해석된다.
// 서버 전용(better-sqlite3). 모듈 구성:
//   schema.ts     — DDL/마이그레이션 + 공용 헬퍼(currentIdx/readState 등)
//   phase-data.ts — 페이즈 스냅샷 데이터(행동/투표/완료/메모/타이머)
//   meta.ts       — 게임 전역 메타(블러핑/claim/글로벌 마커/미치광이/disguise)
//   seats.ts      — 좌석 단위 조작(위치/직업/생사/마커/닉네임/유령표)
//   lifecycle.ts  — 생성/조회/재추첨/페이즈 전환/종료/복기/목록/삭제
//   undo.ts       — 실행 취소(조작 전 전체 스냅샷 스택)
export {
  clearAction,
  clearTimer,
  clearVote,
  getPhaseTimers,
  recordAction,
  recordVote,
  setNote,
  setTimerDuration,
  startTimer,
  stopTimer,
  toggleDone,
  type TimerKind,
} from "./phase-data";
export {
  claimSeat,
  getClaims,
  getDisguises,
  getGlobalMarkers,
  getLunaticBluffs,
  getLunaticMinions,
  releaseSeat,
  resetClaims,
  setBluffs,
  setDisguise,
  setLunaticBluffs,
  setLunaticMinions,
  toggleGlobalMarker,
  type ClaimMap,
} from "./meta";
export {
  savePositions,
  setAlignment,
  setGhostVote,
  setLock,
  setMemo,
  setNickname,
  setRoles,
  setStatus,
  swapSeats,
  toggleMarker,
} from "./seats";
export {
  advancePhase,
  createGame,
  deleteGame,
  finishGame,
  getGame,
  getGameConfig,
  getHistory,
  listGames,
  prevPhase,
  redrawRoles,
  type GameConfig,
  type GameSummary,
  type HistoryEntry,
  type HistoryPlayer,
  type NewPlayer,
  type RoleAssignment,
} from "./lifecycle";
export { captureUndo, clearUndo, undoInfo, undoLast } from "./undo";
