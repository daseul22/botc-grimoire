"use client";

import { useEffect, useRef } from "react";

// 짧은 비프(WebAudio) — 외부 오디오 파일 없이 생성. 모바일 자동재생 정책상 사용자 제스처 전이면
// 막힐 수 있으나(게임 중엔 이미 버튼을 눌러 unlock됨) best-effort. 재생 후 컨텍스트를 닫아 누수 방지.
function beep(): void {
  try {
    const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.start(t);
    osc.stop(t + 0.42);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* 오디오 불가 — 무시 */
  }
}

/**
 * '내 차례'가 도착하는 순간(active: false→true) 능동 알림 — 소리 + 진동 + 탭 타이틀 플래시.
 *
 * 디스코드 음성 전제라 능력·투표를 구두로 부르는 것에 의존했는데, 백그라운드 탭이면 차례를 놓친다.
 * 소리·진동은 포그라운드에서, 타이틀 플래시는 백그라운드에서 신호가 된다(탭으로 돌아오면 복원).
 * 상승 에지에서만 울려 재렌더로 중복 알림하지 않는다.
 */
export function useTurnAlert(active: boolean, title: string): void {
  const prev = useRef(false);
  const origTitle = useRef<string | null>(null);

  useEffect(() => {
    if (active && !prev.current) {
      beep();
      try {
        navigator.vibrate?.([120, 60, 120]);
      } catch {
        /* 진동 미지원 — 무시 */
      }
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        if (origTitle.current === null) origTitle.current = document.title;
        document.title = `🔔 ${title}`;
      }
    }
    prev.current = active;
  }, [active, title]);

  // 탭으로 돌아오면 원래 타이틀 복원.
  useEffect(() => {
    const restore = () => {
      if (document.visibilityState === "visible" && origTitle.current !== null) {
        document.title = origTitle.current;
        origTitle.current = null;
      }
    };
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("focus", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("focus", restore);
    };
  }, []);
}
