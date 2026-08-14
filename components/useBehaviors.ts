"use client";

import { useMemo } from "react";
import { installBehaviors, type BehaviorMap } from "@/lib/behaviors";
import type { Character } from "@/lib/types";

/**
 * 서버가 내려준 직업 목록에서 커스텀 동작 정의를 꺼내 레지스트리에 주입한다.
 *
 * 공식 직업의 기본 동작은 data/behaviors.json으로 클라 번들에 이미 들어 있고, 여기서 다루는 건
 * **커스텀 직업 + 동작이 수정된 공식 직업**뿐이다(Character.behavior가 채워진 항목).
 *
 * useEffect가 아니라 useMemo인 이유: 같은 렌더 안에서 NightSidebar 등이 곧바로
 * actionSpec()을 호출하므로, 커밋 후가 아니라 **렌더 중에** 주입돼 있어야 첫 프레임부터
 * 올바른 스펙으로 그린다. installBehaviors는 idempotent라 StrictMode 이중 렌더에도 안전하다.
 *
 * sheetChars를 props로 받는 진행 화면 진입점(PlayCanvas·GameReplay·DayConsole·
 * PlayerGame·SeatView)에서 본문 최상단에 호출한다.
 */
export function useCharacterBehaviors(chars: Character[] | undefined): void {
  useMemo(() => {
    if (!chars?.length) return;
    const map: BehaviorMap = {};
    for (const c of chars) if (c.behavior) map[c.id] = c.behavior;
    if (Object.keys(map).length) installBehaviors(map);
  }, [chars]);
}
