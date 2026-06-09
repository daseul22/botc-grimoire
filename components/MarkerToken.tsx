import { markerInfo, markerLabel, parseMarker } from "@/lib/markers";
import type { Character } from "@/lib/types";

/**
 * 마커 1개를 토큰으로 렌더.
 * - 집착(mad): 세레노버스 토큰 + 집착 대상 직업 토큰 둘 다 표시
 * - 직업 변경(became)/능력 획득(gained): 해당 직업 토큰 + 구분 배지
 * - 그 외: 고정 아이콘
 */
export function MarkerToken({
  m,
  charMap,
  px = 36,
}: {
  m: string;
  charMap: Record<string, Character>;
  px?: number;
}) {
  const info = markerInfo(m);
  const { base, param } = parseMarker(m);
  const title = markerLabel(m, charMap);
  const dim = { width: px, height: px };
  const imgCls = "rounded-full border bg-bg object-cover shadow";

  if (info?.roleParam && param) {
    const role = charMap[param];
    const roleNode = role?.image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={role.image} alt="" draggable={false} className={imgCls} style={{ ...dim, borderColor: info.color }} />
    ) : (
      <span className={`flex items-center justify-center text-[10px] ${imgCls}`} style={{ ...dim, borderColor: info.color }}>
        {role?.name.ko.charAt(0) ?? "?"}
      </span>
    );

    // 집착: 원인(세레노버스) 토큰 + 대상 직업 토큰
    if (info.icon) {
      return (
        <span className="inline-flex items-center -space-x-2" title={title}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.icon} alt="" draggable={false} className={imgCls} style={{ ...dim, borderColor: info.color }} />
          {roleNode}
        </span>
      );
    }

    // 직업 변경 / 능력 획득: 직업 토큰 + 코너 배지
    const badge = base === "became" ? "↺" : "✦";
    return (
      <span className="relative inline-block" title={title}>
        {roleNode}
        <span
          className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full text-bg"
          style={{ width: px * 0.42, height: px * 0.42, background: info.color, fontSize: px * 0.28 }}
        >
          {badge}
        </span>
      </span>
    );
  }

  if (info?.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={info.icon} alt={info.label} title={title} draggable={false} className={imgCls} style={{ ...dim, borderColor: info.color }} />
    );
  }

  return <span title={title} className="inline-block rounded-full" style={{ width: px * 0.3, height: px * 0.3, background: info?.color ?? "#888" }} />;
}
