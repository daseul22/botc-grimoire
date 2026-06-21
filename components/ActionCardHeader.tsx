import type { ReactNode } from "react";

export type HeaderTag = {
  key: string;
  label: string;
  title?: string;
  tone: "muted" | "amber" | "red" | "purple";
};

const TONE: Record<HeaderTag["tone"], string> = {
  muted: "bg-surface-2 text-muted",
  amber: "bg-amber-500/20 text-amber-300",
  red: "bg-red-500/15 text-red-300",
  purple: "bg-purple-500/15 text-purple-300",
};

/**
 * 밤/낮 행동 카드 헤더(공용). 늘어나는 상태 표시(disguise·사망·사망예정·능력사용함·거짓경고)를
 * "식별 줄"(순번·아이콘·닉네임·직업·✓)과 분리해 아래 "태그 줄"에서 wrap 시킨다.
 * → 표시가 많아져도 ✓ 정렬이나 닉네임/직업이 밀려 깨지지 않는다.
 */
export function ActionCardHeader({
  index,
  image,
  overlay,
  nickname,
  roleName,
  roleColor,
  checked,
  done,
  onToggleDone,
  tags = [],
  taint,
}: {
  /** 밤 행동 순서 번호. 낮 능력처럼 순서가 없으면 생략. */
  index?: number;
  image?: string;
  /** disguise/획득 좌석의 '진짜 직업' 작은 겹침 아이콘. */
  overlay?: { image?: string; title: string };
  nickname: string;
  roleName: string;
  roleColor?: string;
  /** ✓ 초록 표시(처리 완료 또는 능력 사용함). */
  checked: boolean;
  /** 처리 완료 상태(툴팁 문구용). */
  done: boolean;
  onToggleDone: () => void;
  tags?: HeaderTag[];
  /** 거짓 정보 경고(<TaintWarning/> 노드) — 없으면 null. */
  taint?: ReactNode;
}) {
  return (
    <>
      {/* 식별 줄 — 항상 한 줄, ✓는 우측 고정 */}
      <div className="flex items-center gap-2 text-sm">
        {index != null && <span className="w-4 shrink-0 text-right tabular-nums text-muted">{index}</span>}
        <span className="relative inline-flex shrink-0">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-6 w-6 rounded-full object-cover" />
          )}
          {overlay?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={overlay.image}
              alt=""
              title={overlay.title}
              className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-bg object-cover ring-1 ring-border"
            />
          )}
        </span>
        <span className="min-w-0 truncate font-medium">{nickname}</span>
        <span className="shrink-0 text-xs" style={{ color: roleColor }}>{roleName}</span>
        <button
          type="button"
          title={done ? "처리 완료 해제" : "처리 완료"}
          onClick={onToggleDone}
          className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
            checked ? "border-green-500 bg-green-500/20 text-green-400" : "border-border text-muted hover:border-green-500/60"
          }`}
        >
          ✓
        </button>
      </div>

      {/* 태그 줄 — 상태가 늘어도 여기서 wrap (정렬 안정화) */}
      {(tags.length > 0 || taint) && (
        <div className="mt-1 ml-6 flex flex-wrap items-center gap-1">
          {taint}
          {tags.map((t) => (
            <span key={t.key} title={t.title} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE[t.tone]}`}>
              {t.label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
