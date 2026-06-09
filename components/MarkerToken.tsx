import { markerInfo, markerLabel, parseMarker } from "@/lib/markers";
import type { Character } from "@/lib/types";

/**
 * 마커 1개를 토큰으로 렌더.
 * - 집착(mad): 세레노버스 토큰 + 집착 대상 직업 토큰 둘 다
 * - 직업 변경(became)/능력 획득(gained): 직업 토큰 + 코너 배지 (대상 없으면 글자 뱃지)
 * - 능력 없음(noability): 글자 뱃지 (대상 있으면 옆에 직업 토큰)
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

  // 색배경 + 글자/기호 뱃지. 색 점만으로 구분 안 되던 마커들 대체.
  const letterBadge = info && (
    <span
      className="flex items-center justify-center rounded-full border font-bold text-white shadow"
      style={{ ...dim, background: info.color, borderColor: info.color, fontSize: px * 0.55, lineHeight: 1 }}
    >
      {info.letter ?? info.label.charAt(0)}
    </span>
  );

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

    // 집착처럼 원인 토큰(icon) 있는 마커: icon + 대상 직업 토큰
    if (info.icon) {
      return (
        <span className="inline-flex items-center -space-x-2" title={title}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.icon} alt="" draggable={false} className={imgCls} style={{ ...dim, borderColor: info.color }} />
          {roleNode}
        </span>
      );
    }

    // icon 없는 roleParam 마커: 글자 뱃지 + 대상 직업 토큰을 나란히
    return (
      <span className="inline-flex items-center -space-x-2" title={title}>
        {letterBadge}
        {roleNode}
      </span>
    );
  }

  // 아이콘 있고 대상 없는 일반 마커
  if (info?.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={info.icon} alt={info.label} title={title} draggable={false} className={imgCls} style={{ ...dim, borderColor: info.color }} />
    );
  }

  // icon 없고 대상도 없음 — 색배경 글자 뱃지
  return <span title={title}>{letterBadge}</span>;
}
