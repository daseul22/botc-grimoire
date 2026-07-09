// 플레이어 닉네임 구분 색 — 순수 모듈(클라/서버 공용, DB 의존 없음).
//
// 온라인 이야기꾼이 채팅·보드에서 플레이어를 색으로 구분하기 위한 팔레트. 서로 잘 구분되는 15색
// (최대 인원 15인)을 어두운 배경에서 읽히도록 고른 값. 방 입장 시 랜덤 distinct 배정, ST가 수정 가능.

export type PlayerColor = { id: string; hex: string; name: string };

/** 구분 쉬운 15색(색상환을 넓게 + 갈색·회색으로 추가 분리). 어두운 배경 가독. */
export const PLAYER_COLORS: PlayerColor[] = [
  { id: "red", hex: "#ff6b6b", name: "빨강" },
  { id: "orange", hex: "#ff922b", name: "주황" },
  { id: "yellow", hex: "#ffd43b", name: "노랑" },
  { id: "lime", hex: "#a9e34b", name: "연두" },
  { id: "green", hex: "#51cf66", name: "초록" },
  { id: "teal", hex: "#20c997", name: "청록" },
  { id: "cyan", hex: "#3bc9db", name: "하늘" },
  { id: "blue", hex: "#4dabf7", name: "파랑" },
  { id: "indigo", hex: "#5c7cfa", name: "남색" },
  { id: "violet", hex: "#9775fa", name: "보라" },
  { id: "grape", hex: "#cc5de8", name: "자주" },
  { id: "pink", hex: "#f06595", name: "분홍" },
  { id: "rose", hex: "#e64980", name: "장미" },
  { id: "brown", hex: "#b08968", name: "갈색" },
  { id: "gray", hex: "#ced4da", name: "회색" },
];

const BY_ID = new Map(PLAYER_COLORS.map((c) => [c.id, c]));

/**
 * 색 id → hex. 지정이 없으면 fallbackKey(대개 userId/seat)로 결정론적 폴백(항상 어떤 색은 나옴).
 * 저장값이 직접 hex(#rrggbb)여도 허용.
 */
export function colorHex(id: string | null | undefined, fallbackKey = 0): string {
  if (id) {
    const c = BY_ID.get(id);
    if (c) return c.hex;
    if (/^#[0-9a-fA-F]{6}$/.test(id)) return id;
  }
  const n = PLAYER_COLORS.length;
  return PLAYER_COLORS[(((fallbackKey % n) + n) % n)].hex;
}

export function colorName(id: string | null | undefined): string {
  return (id && BY_ID.get(id)?.name) || "";
}

export function isPlayerColor(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * 방에서 아직 쓰지 않은 색 중 하나를 랜덤으로(있으면). 다 썼으면 전체에서 랜덤.
 * 서버(방 입장 시 배정)에서 사용 — Math.random은 서버 액션/모듈에서 허용.
 */
export function pickUnusedColor(used: Iterable<string>): string {
  const set = new Set(used);
  const free = PLAYER_COLORS.filter((c) => !set.has(c.id));
  const pool = free.length ? free : PLAYER_COLORS;
  return pool[Math.floor(Math.random() * pool.length)].id;
}
