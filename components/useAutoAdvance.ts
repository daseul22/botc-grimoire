"use client";

import { useEffect, useRef } from "react";
import { advanceNominationAction } from "@/app/rooms/actions";

type AutoNom = {
  id: string;
  status: string;
  perSeatSec: number;
  paused: boolean;
  turnStartedAt: string | null;
  step: number;
} | null;

/**
 * 시계바늘 자동 진행 드라이버 — voting + perSeatSec>0 + 미정지일 때 현재 턴이 만료되면
 * advanceNominationAction을 호출한다. step CAS(서버)로 여러 클라가 동시에 호출해도 무해하다.
 * ST 클라(주)·현재 투표자 클라(보조)가 각각 이 훅을 돌린다. 모두 백그라운드면 스윕이 멈췄다가
 * 포커스 복귀 시 재개된다(수동 ▶다음은 항상 가능).
 */
export function useAutoAdvance(nom: AutoNom, roomId: string, onAfter?: () => void) {
  const firedStep = useRef(-1);
  useEffect(() => {
    if (!nom || nom.status !== "voting" || nom.perSeatSec <= 0 || nom.paused || !nom.turnStartedAt) return;
    const remainingMs = nom.perSeatSec * 1000 - (Date.now() - Date.parse(nom.turnStartedAt));
    let cancelled = false;
    const fire = () => {
      if (cancelled || firedStep.current === nom.step) return; // 이 step엔 한 번만
      firedStep.current = nom.step;
      advanceNominationAction(roomId, nom.id, nom.step)
        .then(() => onAfter?.())
        .catch(() => {});
    };
    const t = setTimeout(fire, Math.max(0, remainingMs) + 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // step이 바뀔 때마다(턴 넘어갈 때) 타이머를 새로 무장한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nom?.id, nom?.status, nom?.step, nom?.perSeatSec, nom?.paused, nom?.turnStartedAt, roomId]);
}
