// 지목 화살표 오버레이 — 활성 지목이 있으면 지목자→대상 좌석을 잇는 SVG. ST·플레이어 보드 공용.
//
// 좌표계: 토큰은 player.x/y(0~1 정규화)를 %로 배치한다. 보드마다 매핑이 달라 inset으로 흡수한다.
//  - PlayCanvas(ST, 비정사각): raw v*100% → inset=0.
//  - PlayerGame(플레이어, 정사각): (0.1 + v*0.8)*100% → inset=0.1.
// viewBox 0..100 + preserveAspectRatio="none"로 SVG 좌표가 컨테이너 %와 정확히 일치(선은 정확,
// 화살촉은 비정사각에서 약간 늘어날 수 있으나 무해).

type SeatXY = { seat: number; x: number; y: number };

export function NominationArrow({
  players,
  nominator,
  nominee,
  inset = 0,
}: {
  players: SeatXY[];
  nominator: number;
  nominee: number;
  /** 보드 좌표 매핑 인셋(정사각 플레이어 보드=0.1, ST 보드=0). */
  inset?: number;
}) {
  const pt = (seat: number) => {
    const p = players.find((pp) => pp.seat === seat);
    if (!p) return null;
    const map = (v: number) => (inset + v * (1 - 2 * inset)) * 100;
    return { x: map(p.x), y: map(p.y) };
  };
  const a = pt(nominator);
  const b = pt(nominee);
  if (!a || !b) return null;
  // 토큰을 안 가리게 양 끝을 좌석 방향으로 살짝 물린다(중심선 → 토큰 언저리).
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = 5; // viewBox 단위(≈토큰 반지름)
  const ax = a.x + (dx / len) * off;
  const ay = a.y + (dy / len) * off;
  const bx = b.x - (dx / len) * off;
  const by = b.y - (dy / len) * off;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <marker id="nomArrowHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#d23b3b" />
        </marker>
      </defs>
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke="#d23b3b"
        strokeWidth="0.7"
        strokeDasharray="2 1.5"
        markerEnd="url(#nomArrowHead)"
        opacity="0.9"
      />
    </svg>
  );
}
