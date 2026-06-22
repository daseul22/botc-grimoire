import type { NextRequest } from "next/server";
import { subscribeGame, gameRev } from "@/lib/realtime";

// 게임 변경을 푸시하는 Server-Sent Events 엔드포인트.
// 클라(플레이어 폰의 SeatView 등)가 EventSource로 구독하면, 이야기꾼이 게임을 바꿀 때마다
// 즉시 'update' 이벤트를 받아 화면을 갱신한다(기존 15초 폴링 대체).
//
// 보안: 이 스트림은 "바뀌었다"는 신호(rev)만 흘리고 게임 본문은 싣지 않는다.
// 실제 데이터는 클라가 각자 권한에 맞는 경로(페이지 렌더/액션)로 다시 가져가므로,
// gameId만 알면 누구나 신호는 받을 수 있어도 비밀 정보는 새지 않는다.
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // EventEmitter·장기 연결 → Edge 아님

const enc = new TextEncoder();

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await ctx.params;
  const req = _req;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          /* 컨트롤러가 이미 닫힘 */
        }
      };

      // 끊겼을 때 클라가 3초 후 재연결하도록 권고 + 최초 동기화 기준 rev.
      send("retry: 3000\n\n");
      send(`event: hello\ndata: ${JSON.stringify({ rev: gameRev(gameId) })}\n\n`);

      const unsub = subscribeGame(gameId, (event) => {
        send(`event: update\ndata: ${JSON.stringify(event)}\n\n`);
      });

      // keepalive — 프록시·로드밸런서가 유휴 연결을 끊지 않도록 주석 핑.
      const ping = setInterval(() => send(": ping\n\n"), 25000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
      };

      // 핸들러 셋업 중 이미 연결이 끊겼다면 abort 이벤트가 다시 안 오므로 즉시 정리(리스너·interval 누수 방지).
      if (req.signal.aborted) {
        close();
        return;
      }
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx 등 역프록시의 응답 버퍼링을 끈다(스트리밍 가이드 권고).
      "X-Accel-Buffering": "no",
    },
  });
}
