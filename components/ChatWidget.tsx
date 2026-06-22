"use client";

import { useEffect, useRef, useState } from "react";
import { getMessagesAction, sendChatAction } from "@/app/rooms/actions";
import { useRoomStream } from "./useGameStream";

// lib/chat의 ChatMessage와 동일 구조(서버 모듈을 클라가 import하지 않도록 로컬 정의).
type ChatMessage = { id: number; userId: number; nickname: string; body: string; createdAt: string };

/**
 * 룸 전체 채팅 플로팅 위젯 — 로비·플레이어 보드·이야기꾼 보드 어디서나 띄운다.
 * 룸 SSE로 새 메시지를 받아 갱신하고, 닫혀 있으면 미읽음 수를 뱃지로 보여준다.
 */
export function ChatWidget({ roomId, meId }: { roomId: string; meId: number }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const lastSeenId = useRef(0);
  const seeded = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = () => {
    getMessagesAction(roomId)
      .then((m) => {
        // 최초 로드 시엔 기존 백로그를 "이미 본 것"으로 간주(미읽음 뱃지가 과거 전체를 세지 않게).
        if (!seeded.current) {
          seeded.current = true;
          lastSeenId.current = m.length ? m[m.length - 1].id : 0;
        }
        setMsgs(m as ChatMessage[]);
      })
      .catch(() => {});
  };
  useEffect(() => {
    seeded.current = false;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  useRoomStream(roomId, load);

  // 메시지 변동 시: 열려 있으면 읽음 처리 + 하단 스크롤, 닫혀 있으면 미읽음 카운트.
  useEffect(() => {
    const latest = msgs.length ? msgs[msgs.length - 1].id : 0;
    if (open) {
      lastSeenId.current = latest;
      setUnread(0);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    } else {
      setUnread(msgs.filter((m) => m.id > lastSeenId.current && m.userId !== meId).length);
    }
  }, [msgs, open, meId]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void sendChatAction(roomId, t).then(load);
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface shadow-lg hover:border-gold/60"
          title="전체 채팅"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-bg">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}

      {/* 드로어 */}
      {open && (
        <div className="fixed bottom-0 right-0 z-40 flex h-[60vh] w-full flex-col border border-border bg-surface shadow-xl sm:bottom-4 sm:right-4 sm:h-[28rem] sm:w-80 sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold">전체 채팅</h2>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:text-text" title="닫기">✕</button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {msgs.length === 0 ? (
              <p className="pt-8 text-center text-xs text-muted">아직 메시지가 없습니다.</p>
            ) : (
              msgs.map((m) => {
                const mine = m.userId === meId;
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    {!mine && <span className="mb-0.5 text-[11px] text-muted">{m.nickname}</span>}
                    <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-gold/20 text-text" : "bg-surface-2 text-text"}`}>
                      <span className="whitespace-pre-wrap break-words">{m.body}</span>
                    </div>
                    <span className="mt-0.5 text-[10px] text-muted">{fmt(m.createdAt)}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex gap-2 border-t border-border p-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              maxLength={1000}
              placeholder="메시지…"
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-gold/60"
            />
            <button
              type="button"
              onClick={send}
              disabled={!text.trim()}
              className="rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-bg disabled:opacity-40"
            >
              전송
            </button>
          </div>
        </div>
      )}
    </>
  );
}
