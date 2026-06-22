"use client";

import { useEffect, useRef, useState } from "react";
import { getMessagesAction, sendChatAction } from "@/app/rooms/actions";
import { useRoomStream } from "./useGameStream";
import { Select } from "./Select";
import { Modal } from "./Modal";

// lib/chat의 ChatMessage와 동일 구조(클라가 서버 모듈을 import하지 않도록 로컬 정의).
type ChatMessage = {
  id: number;
  userId: number;
  nickname: string;
  body: string;
  recipientUserId: number | null;
  recipientNickname: string;
  createdAt: string;
};

export type ChatMember = { userId: number; nickname: string };

/**
 * 룸 채팅 플로팅 위젯 — 전체 채팅 + 귓말. 로비·플레이어 보드·이야기꾼 보드 어디서나 띄운다.
 * - 작은 드로어 ↔ 화면 중앙 큰 모달 전환(확대).
 * - 귓말: 받는 사람을 고르면 그 사람에게만(이야기꾼은 모든 귓말 열람).
 */
export function ChatWidget({
  roomId,
  meId,
  members = [],
}: {
  roomId: string;
  meId: number;
  members?: ChatMember[];
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [recipientId, setRecipientId] = useState(0); // 0 = 전체
  const [unread, setUnread] = useState(0);
  const lastSeenId = useRef(0);
  const seeded = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = () => {
    getMessagesAction(roomId)
      .then((m) => {
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
    void sendChatAction(roomId, t, recipientId === 0 ? null : recipientId).then(load);
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const others = members.filter((m) => m.userId !== meId);
  const recipientOptions = [
    { value: 0, label: "전체" },
    ...others.map((m) => ({ value: m.userId, label: m.nickname })),
  ];

  // 메시지 한 줄 — 전체/귓말 구분 렌더.
  const renderMessage = (m: ChatMessage) => {
    const mine = m.userId === meId;
    const whisper = m.recipientUserId != null;
    let label = "";
    if (whisper) {
      if (mine) label = `귓말 → ${m.recipientNickname}`;
      else if (m.recipientUserId === meId) label = `${m.nickname} 귓말`;
      else label = `${m.nickname} → ${m.recipientNickname} 귓말`; // 이야기꾼이 보는 남의 귓말
    } else if (!mine) {
      label = m.nickname;
    }
    const bubbleCls = whisper
      ? "border border-indigo-400/40 bg-indigo-500/15 text-text"
      : mine
        ? "bg-gold/20 text-text"
        : "bg-surface-2 text-text";
    return (
      <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
        {label && (
          <span className={`mb-0.5 text-[11px] ${whisper ? "text-indigo-300" : "text-muted"}`}>{label}</span>
        )}
        <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${bubbleCls}`}>
          <span className="whitespace-pre-wrap break-words">{m.body}</span>
        </div>
        <span className="mt-0.5 text-[10px] text-muted">{fmt(m.createdAt)}</span>
      </div>
    );
  };

  const body = (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">채팅</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-muted hover:text-text"
            title={expanded ? "작게" : "크게 보기"}
          >
            {expanded ? (
              // 축소(minimize) — 모서리 브래킷이 안쪽(중앙)으로 모임. 그리모어 전체화면 토글과 동일 아이콘.
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              // 확대(maximize) — 모서리 브래킷이 바깥(모서리)으로 벌어짐.
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:text-text" title="닫기">✕</button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {msgs.length === 0 ? (
          <p className="pt-8 text-center text-xs text-muted">아직 메시지가 없습니다.</p>
        ) : (
          msgs.map(renderMessage)
        )}
      </div>

      <div className="border-t border-border p-2">
        {others.length > 0 && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-muted">받는 사람</span>
            <Select
              value={recipientId}
              onChange={(v) => setRecipientId(v)}
              ariaLabel="받는 사람"
              options={recipientOptions}
              className="min-w-24 py-1.5 text-xs"
            />
            {recipientId !== 0 && <span className="text-[11px] text-indigo-300">귓말</span>}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // 한글 등 IME 조합 중 Enter는 무시(조합 확정용) — '안녕'이 두 번 가던 버그 방지.
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={1000}
            placeholder={recipientId === 0 ? "메시지…" : "귓말…"}
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
    </>
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface shadow-lg hover:border-gold/60"
          title="채팅"
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

      {open && !expanded && (
        <div className="fixed bottom-0 right-0 z-40 flex h-[60vh] w-full flex-col border border-border bg-surface shadow-xl sm:bottom-4 sm:right-4 sm:h-[28rem] sm:w-80 sm:rounded-2xl">
          {body}
        </div>
      )}

      <Modal
        open={open && expanded}
        onClose={() => setExpanded(false)}
        panelClassName="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
      >
        {body}
      </Modal>
    </>
  );
}
