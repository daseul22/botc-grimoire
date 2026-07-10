// 실시간 이벤트 버스 — 서버 전용(순수 Node, DB 의존 없음).
//
// 게임/룸별 인메모리 pub/sub. 서버 액션이 상태를 바꾸면 여기로 신호를 쏘고,
// SSE 라우트(api/games/[id]/stream, api/rooms/[id]/stream)가 구독해 연결된 클라에 push한다.
//
// 설계 의도:
//   - 진실 원천은 여전히 SQLite. 이 버스는 "바뀌었다"는 신호(rev)만 흘린다.
//     클라는 신호를 받으면 자기 권한에 맞는 경로로 다시 fetch/refresh한다
//     → 비밀 정보(다른 좌석 직업)가 버스로 새지 않는다(권한은 fetch 경로에서 강제).
//   - "노트북 1대 = 서버"(LAN+터널)나 "작은 VPS 1대" 모두 단일 장기 실행 Node 프로세스라
//     인메모리 EventEmitter로 충분하다. 외부 의존성 0.
//   - 훗날 서버리스/다중 인스턴스로 가면 이 파일의 emit/subscribe 구현만
//     외부 pub/sub(Redis·Pusher 등)으로 교체하면 된다. 호출부는 그대로.

import { EventEmitter } from "node:events";

/** 변경 신호. payload는 최소 — 클라는 rev로 중복/순서만 판단하고 본문은 따로 fetch. */
export type ChannelEvent = {
  type: "update";
  /** 채널 키(게임 id 또는 룸 id). */
  channel: string;
  /** 채널별 단조 증가 리비전. 클라가 이미 본 rev면 무시 가능. */
  rev: number;
  at: number;
};

// HMR(dev)·모듈 재평가에도 단일 인스턴스를 유지하려고 globalThis에 캐싱한다.
const store = globalThis as unknown as {
  __botcBus?: EventEmitter;
  __botcRevs?: Map<string, number>;
};
const bus = (store.__botcBus ??= new EventEmitter());
// 한 채널에 다수 구독자(여러 폰)가 붙으므로 기본 10개 경고를 끈다.
bus.setMaxListeners(0);
const revs = (store.__botcRevs ??= new Map<string, number>());

// ── 채널 일반 API(내부) ──
function emitChannel(channel: string): void {
  const rev = (revs.get(channel) ?? 0) + 1;
  revs.set(channel, rev);
  const event: ChannelEvent = { type: "update", channel, rev, at: Date.now() };
  bus.emit(channel, event);
}
function channelRev(channel: string): number {
  return revs.get(channel) ?? 0;
}
function subscribeChannel(channel: string, listener: (event: ChannelEvent) => void): () => void {
  bus.on(channel, listener);
  return () => {
    bus.off(channel, listener);
  };
}

// ── 게임 채널 ──
// 게임 변경을 알린다 — 서버 액션이 DB 커밋 후 호출. (게임 id와 룸 id는 접두사가 달라 충돌 없음.)
export function emitGameUpdate(gameId: string): void {
  emitChannel(gameId);
}
export function gameRev(gameId: string): number {
  return channelRev(gameId);
}
export function subscribeGame(gameId: string, listener: (event: ChannelEvent) => void): () => void {
  return subscribeChannel(gameId, listener);
}

// ── 룸 채널(온라인 로비) ──
export function emitRoomUpdate(roomId: string): void {
  emitChannel(roomId);
}
export function roomRev(roomId: string): number {
  return channelRev(roomId);
}
export function subscribeRoom(roomId: string, listener: (event: ChannelEvent) => void): () => void {
  return subscribeChannel(roomId, listener);
}

/**
 * 종료된 룸의 rev 엔트리 정리 — 장기 실행 프로세스에서 닫힌 룸 rev가 revs Map에 무한 누적되는 걸 막는다.
 * 리스너는 SSE 라우트가 연결 종료 시 스스로 unsub하므로 여기선 rev 엔트리만 지운다(닫힌 룸 id는 재사용 안 됨).
 */
export function clearRoomChannel(roomId: string): void {
  revs.delete(roomId);
}
