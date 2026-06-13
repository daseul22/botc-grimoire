import { useEffect, useRef } from "react";

/**
 * 모달이 열려 있는 동안 history 항목을 하나 push해, 모바일 뒤로가기(브라우저 back)가
 * 페이지를 떠나는 대신 모달만 닫도록 만든다(popstate → onClose).
 *
 * 정리(back())는 일부러 하지 않는다 — React StrictMode(dev)가 effect를 mount→cleanup→remount로
 * 두 번 실행하는데, cleanup에서 history.back()을 부르면 그 popstate를 remount 리스너가 잡아
 * 모달이 *열리자마자 닫히는* 버그가 생긴다. 닫을 때 항목을 남겨두는 사소한 비용(다음 back 1회가
 * 같은 화면으로의 no-op)을 감수하고, 오작동 없는 단순·안전한 동작을 택한다.
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ __modal: true }, "");
    const onPop = () => onCloseRef.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);
}
