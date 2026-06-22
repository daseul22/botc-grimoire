import type { NextRequest } from "next/server";
import { subscribeRoom, roomRev } from "@/lib/realtime";

// 로비(룸) 변경을 푸시하는 SSE 엔드포인트 — 멤버 입장/퇴장, 좌석 배정, 시작 등을 즉시 반영.
// 게임 스트림(api/games/[id]/stream)과 같은 구조. 신호(rev)만 흘리고 본문은 각자 권한경로로 fetch.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const enc = new TextEncoder();

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await ctx.params;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          /* 이미 닫힘 */
        }
      };

      send("retry: 3000\n\n");
      send(`event: hello\ndata: ${JSON.stringify({ rev: roomRev(roomId) })}\n\n`);

      const unsub = subscribeRoom(roomId, (event) => {
        send(`event: update\ndata: ${JSON.stringify(event)}\n\n`);
      });

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
      "X-Accel-Buffering": "no",
    },
  });
}
