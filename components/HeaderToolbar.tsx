"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Game } from "@/lib/types";
import {
  advancePhaseAction,
  finishGameAction,
  lanUrlAction,
  prevPhaseAction,
  redrawAction,
  undoAction,
} from "@/app/play/actions";

// LAN IP는 비보안 컨텍스트(http)라 navigator.clipboard가 없을 수 있다.
// 보안 컨텍스트면 Clipboard API, 아니면 execCommand 폴백. 둘 다 실패하면 수동 복사 유도.
async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

/**
 * 진행 화면 상단 — 페이즈 헤더 + 액션 버튼들 + 공유 URL 배너 + 게임 종료 배너.
 * arrangeCircle/run/setGame은 PlayCanvas가 owner라 콜백으로 받는다.
 */
export function HeaderToolbar({
  game,
  night,
  busy,
  run,
  onArrangeCircle,
}: {
  game: Game;
  night: boolean;
  busy: boolean;
  run: (fn: () => Promise<Game | { error: string }>) => void;
  onArrangeCircle: () => void;
}) {
  const [showEnd, setShowEnd] = useState(false);
  const [share, setShare] = useState<{ url: string; copied: boolean; label: string } | null>(null);
  const [, startFinish] = useTransition();

  const shareLink = async (path: string, label: string) => {
    const r = await lanUrlAction(path);
    if ("error" in r) {
      alert(r.error);
      return;
    }
    const copied = await copyText(r.url);
    setShare({ url: r.url, copied, label });
  };

  // 본인 진짜 직업을 모르는 직업(미치광이·주정뱅이·꼭두각시)은 폰에 진짜 직업을 노출하면 게임이 망한다.
  // 모든 해당 좌석에 가짜 직업(disguise)이 지정돼야 직업배포·직업공유를 허용한다.
  const missing = game.players.filter(
    (p) =>
      (p.characterId === "lunatic" ||
        p.characterId === "drunk" ||
        p.characterId === "marionette") &&
      !game.disguises?.[p.seat],
  );
  const blocked = missing.length > 0;
  const blockTitle = blocked
    ? `가짜 직업 미지정: ${missing.map((p) => p.nickname).join(", ")} — 1일차 밤 셋업 배너에서 지정하세요`
    : undefined;

  return (
    <>
      {/* 페이즈 헤더 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
            style={{
              background: night ? "#4a90d918" : "#d4a23a18",
              border: `1px solid ${night ? "#4a90d955" : "#d4a23a55"}`,
            }}
          >
            {night ? "🌙" : "☀️"}
          </div>
          <div>
            <p className="text-xs text-muted">{game.sheetName}</p>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">
                {game.day}일차 {night ? "밤" : "낮"}
              </h1>
              <span className="text-xs text-muted">
                스냅샷 {game.phaseIndex + 1}/{game.phaseCount}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              disabled={busy || game.phaseIndex === 0}
              onClick={() => run(() => prevPhaseAction(game.id))}
              className="flex items-center gap-1 px-3 py-2 text-sm text-muted enabled:hover:bg-surface-2 enabled:hover:text-text disabled:opacity-30"
            >
              <Chevron dir="left" /> 이전
            </button>
            <span className="h-6 w-px bg-border" />
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => advancePhaseAction(game.id))}
              className="flex items-center gap-1 bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
            >
              다음 {night ? "낮" : "밤"} <Chevron dir="right" />
            </button>
          </div>
          <button
            type="button"
            disabled={busy || game.undo.count === 0}
            onClick={() => run(() => undoAction(game.id))}
            title={
              game.undo.lastLabel
                ? `실행 취소: ${game.undo.lastLabel} (${game.undo.count}개 가능)`
                : "되돌릴 조작이 없습니다"
            }
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
          >
            ↩ 취소
          </button>
          <button
            type="button"
            onClick={onArrangeCircle}
            title="토큰을 원형으로 정렬"
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text"
          >
            ◯ 정렬
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm("직업을 다시 추첨할까요? 현재 진행상황이 모두 초기화됩니다.")) run(() => redrawAction(game.id));
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            재추첨
          </button>
          <button
            type="button"
            onClick={() => setShowEnd((v) => !v)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text"
          >
            게임 종료
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => shareLink(`/play/${game.id}/claim`, "직업배포(잠금)")}
            title={
              blockTitle ??
              "자리 점유형 배포 링크 복사 — 헤더 없음, 한 명이 고르면 그 자리는 잠겨 엿보기 방지"
            }
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
          >
            🔒 직업배포
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => shareLink(`/play/${game.id}/seat`, "직업공유")}
            title={blockTitle ?? "자유 선택형 자리 보기 링크 복사 (헤더 있음, 재선택 가능)"}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
          >
            📱 직업공유
          </button>
          <Link
            href="/games"
            className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text"
            title="진행 화면 나가기"
          >
            나가기
          </Link>
        </div>
      </div>

      {share && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">{share.label}</span>
          <span className={share.copied ? "text-green-400" : "text-amber-400"}>
            {share.copied ? "📋 주소 복사됨" : "복사 실패 — 아래 주소를 직접 복사하세요"}
          </span>
          <code className="select-all rounded bg-surface-2 px-2 py-1 text-xs text-text">{share.url}</code>
          <span className="text-xs text-muted">같은 WiFi 폰 브라우저에서 열어 자리(직업) 확인</span>
          <button
            type="button"
            onClick={() => setShare(null)}
            className="ml-auto text-muted hover:text-text"
            title="닫기"
          >
            ✕
          </button>
        </div>
      )}

      {showEnd && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
          <span className="text-sm text-muted">승리 진영:</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => startFinish(() => finishGameAction(game.id, "good"))}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: "#4a90d922", color: "#4a90d9" }}
          >
            선 진영 승리
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => startFinish(() => finishGameAction(game.id, "evil"))}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ background: "#d23b3b22", color: "#d23b3b" }}
          >
            악 진영 승리
          </button>
          <button
            type="button"
            onClick={() => setShowEnd(false)}
            className="ml-auto text-sm text-muted hover:text-text"
          >
            취소
          </button>
        </div>
      )}
    </>
  );
}
