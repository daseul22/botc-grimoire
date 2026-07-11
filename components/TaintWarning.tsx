import { isTainted } from "@/lib/markers";
import { INFO_KINDS, type ResultKind } from "@/lib/night-actions";

/**
 * '거짓 정보를 줘야 함' 경고 배지. 좌석이 취함/중독(또는 Vortox 등 전역 오염) 상태이고
 * 그 직업이 정보 능력(INFO_KINDS)일 때만 노출. NightSidebar·DaySidebar가 공유해
 * 문구·조건이 한쪽만 바뀌어 어긋나는 것을 막는다.
 */
export function TaintWarning({
  markers,
  globalMarkers,
  resultKind,
  info,
}: {
  markers: string[];
  globalMarkers: string[];
  resultKind: ResultKind;
  /** result가 INFO_KINDS 밖(text)이어도 실질 정보 능력이면 경고 대상(꿈꾸는 자 등). */
  info?: boolean;
}) {
  if (!isTainted(markers, globalMarkers) || !(INFO_KINDS.has(resultKind) || info)) return null;
  return (
    <span
      className="rounded bg-amber-500/20 px-1 text-[10px] font-medium text-amber-400"
      title="취함/중독 — 거짓 정보를 줘야 합니다"
    >
      ⚠ 거짓
    </span>
  );
}
