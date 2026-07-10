// 지목 화살표 오버레이 — 활성 지목이 있으면 지목자→대상 좌석을 잇는 SVG. ST·플레이어 보드 공용.
//
// 좌표계: 토큰은 player.x/y(0~1 정규화)를 %로 배치한다. 보드마다 매핑이 달라 inset으로 흡수한다.
//  - PlayCanvas(ST, 비정사각): raw v*100% → inset=0.
//  - PlayerGame(플레이어, 정사각): (0.1 + v*0.8)*100% → inset=0.1.
// viewBox 0..100 + preserveAspectRatio="none"로 SVG 좌표가 컨테이너 %와 일치(선 위치는 정확).
// 선 굵기는 non-scaling-stroke로 화면 px 고정(비정사각 보드에서도 균일). z-20으로 토큰 위에 그려
// 화살촉이 안 가리게 하고, 대상 토큰 언저리를 가리키도록 양 끝을 물린다.

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
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // 토큰 언저리까지 물려 화살촉이 대상 토큰 바로 밖을 가리키게(짧은 화살표는 비율로 줄임).
  const pull = Math.min(7, len * 0.32);
  const ax = a.x + ux * pull;
  const ay = a.y + uy * pull;
  const bx = b.x - ux * pull;
  const by = b.y - uy * pull;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      aria-hidden
    >
      <defs>
        <marker id="nomHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0,0.5 L9.5,5 L0,9.5 z" fill="#ef4444" stroke="#450a0a" strokeWidth="0.8" strokeLinejoin="round" />
        </marker>
      </defs>
      {/* 어두운 보드 대비용 검은 외곽선(글로우) */}
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke="#000"
        strokeOpacity="0.55"
        strokeWidth="7"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* 본선 — 붉은 점선, 대상 방향으로 흐르는 애니메이션 + 화살촉 */}
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke="#ef4444"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="7 5"
        vectorEffect="non-scaling-stroke"
        markerEnd="url(#nomHead)"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-12" dur="0.7s" repeatCount="indefinite" />
      </line>
      {/* 지목자 시작점 표시(작은 점) */}
      <circle cx={ax} cy={ay} r="1.6" fill="#ef4444" stroke="#450a0a" strokeWidth="0.5" />
    </svg>
  );
}
