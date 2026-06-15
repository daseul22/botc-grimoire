// 좌석 자동 배치 — 순수 모듈(클라이언트 공용). 원형은 PlayCanvas 인라인, 사각은 여기.
//
// 실제 오프라인 테이블은 원보다 직사각에 가깝고, 사각으로 배치하면 능력 토큰을
// 보여줄 때(좌/우 이웃, 마주보는 자리 등) 실제 좌석 관계가 더 정확히 드러난다.

export type RectSides = { top: number; right: number; bottom: number; left: number };

export const sidesTotal = (s: RectSides) => s.top + s.right + s.bottom + s.left;

/**
 * 원형 배치 정규화 좌표(0~1). 12시 방향에서 시작해 시계방향. 가로 반경 0.4·세로 0.42.
 * 게임 시작 시 초기 배치(startGameAction)와 '원형 정렬' 버튼(PlayCanvas)이 동일한 좌표를 쓰도록 단일화.
 */
export function circlePositions(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.42 * Math.sin(angle) };
  });
}

/**
 * 인원 N을 사각 테이블 4면에 자동 배분. 실제 테이블처럼 상·하(가로)를 좌·우(세로)보다 많게.
 * 합은 항상 N.
 */
export function autoRectSides(n: number): RectSides {
  if (n <= 0) return { top: 0, right: 0, bottom: 0, left: 0 };
  const horiz = Math.max(1, Math.round(n * 0.32));
  const top = Math.min(horiz, n);
  const bottom = Math.min(horiz, n - top);
  const rem = n - top - bottom;
  const left = Math.floor(rem / 2);
  const right = rem - left;
  return { top, right, bottom, left };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 사각 둘레 정규화 좌표(0~1). 시계방향: 상(L→R) → 우(T→B) → 하(R→L) → 좌(B→T).
 * 좌석 순서대로 매핑하면 이웃 관계(원형과 동일하게 둘레 따라 연속)가 보존된다.
 * 각 면은 (j+0.5)/k 간격으로 균등 배치 → 모서리 중복 없이 면 중앙 정렬.
 */
export function rectPositions(sides: RectSides): { x: number; y: number }[] {
  const { top, right, bottom, left } = sides;
  // 벽에서 충분히 띄운다 — 토큰은 좌표를 중심으로 배치되고 마커/이름이 위·아래로 늘어나며,
  // 전체화면(1.8배)에선 더 커진다. 여백이 좁으면 마커 추가 시 토큰이 보드 밖으로 잘린다.
  const x0 = 0.1,
    x1 = 0.9,
    y0 = 0.15,
    y1 = 0.85;
  const pts: { x: number; y: number }[] = [];
  for (let j = 0; j < top; j++) pts.push({ x: lerp(x0, x1, (j + 0.5) / top), y: y0 });
  for (let j = 0; j < right; j++) pts.push({ x: x1, y: lerp(y0, y1, (j + 0.5) / right) });
  for (let j = 0; j < bottom; j++) pts.push({ x: lerp(x1, x0, (j + 0.5) / bottom), y: y1 });
  for (let j = 0; j < left; j++) pts.push({ x: x0, y: lerp(y1, y0, (j + 0.5) / left) });
  return pts;
}
