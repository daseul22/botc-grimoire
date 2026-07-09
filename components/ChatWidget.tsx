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
 * - 작은 드로어: 단일 스트림 + 받는 사람 선택(콤팩트).
 * - 크게 보기(전체화면): **분할 뷰** — 좌측 대화 목록(전체 + 멤버별 귓말 스레드, 최대 14명) +
 *   우측 선택된 스레드. 특정 유저와의 귓말만 따로 관리한다. 모바일은 목록↔대화 마스터-디테일.
 * - 귓말은 발신자·수신자·이야기꾼만 열람(서버 listMessages에서 필터). 그룹핑은 클라 측.
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
  const [recipientId, setRecipientId] = useState(0); // 드로어 받는 사람. 0 = 전체
  const [unread, setUnread] = useState(0);
  const [activeThread, setActiveThread] = useState(0); // 분할 뷰 선택 스레드. 0 = 전체 채팅
  const [seen, setSeen] = useState<Record<number, number>>({}); // 스레드별 마지막으로 본 메시지 id
  const [seedId, setSeedId] = useState<number | null>(null); // 최초 로드 시점 최신 id(스레드 미읽음 기준선)
  const [showPaneMobile, setShowPaneMobile] = useState(false); // 모바일: 대화 pane 표시(목록 숨김)
  const lastSeenId = useRef(0);
  const seeded = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = () => {
    getMessagesAction(roomId)
      .then((m) => {
        if (!seeded.current) {
          seeded.current = true;
          const last = m.length ? m[m.length - 1].id : 0;
          lastSeenId.current = last;
          setSeedId(last);
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

  // ── 스레드 그룹핑(클라) ── 전체=공개, 멤버 X 스레드=X가 발신 또는 수신인 귓말.
  // 플레이어는 자기가 당사자인 귓말만 보이므로 X 스레드=나↔X. 이야기꾼은 X가 낀 모든 귓말.
  const publicMsgs = msgs.filter((m) => m.recipientUserId == null);
  const threadMsgs = (key: number): ChatMessage[] =>
    key === 0
      ? publicMsgs
      : msgs.filter((m) => m.recipientUserId != null && (m.userId === key || m.recipientUserId === key));

  const seenOf = (key: number) => seen[key] ?? seedId ?? 0;
  const unreadOf = (key: number, list: ChatMessage[]) =>
    open && expanded && key === activeThread
      ? 0 // 지금 보고 있는 스레드는 읽음
      : list.filter((m) => m.id > seenOf(key) && m.userId !== meId).length;

  const markRead = (key: number) => {
    const list = threadMsgs(key);
    const latest = list.length ? list[list.length - 1].id : 0;
    setSeen((s) => (s[key] != null && s[key] >= latest ? s : { ...s, [key]: latest }));
  };
  const selectThread = (key: number) => {
    markRead(activeThread); // 떠나는 스레드를 본 것으로 처리
    setActiveThread(key);
    markRead(key);
    setShowPaneMobile(true);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current?.scrollHeight ?? 0 }));
  };

  const sendTo = (recipient: number) => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void sendChatAction(roomId, t, recipient === 0 ? null : recipient).then(load);
  };

  // 메시지 한 줄. inThread=true면 스레드 뷰라 귓말 대상 라벨을 생략(발신자 이름만) — 깔끔하게.
  const renderMessage = (m: ChatMessage, inThread = false) => {
    const mine = m.userId === meId;
    const whisper = m.recipientUserId != null;
    let label = "";
    if (inThread) {
      if (!mine)
        label =
          whisper && m.recipientUserId !== meId ? `${m.nickname} → ${m.recipientNickname}` : m.nickname;
    } else if (whisper) {
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

  const onInputKey = (e: React.KeyboardEvent, recipient: number) => {
    // 한글 등 IME 조합 중 Enter는 무시(조합 확정용) — '안녕'이 두 번 가던 버그 방지.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTo(recipient);
    }
  };

  const header = (
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
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
  );

  // ── 작은 드로어: 단일 스트림 + 받는 사람 선택 ──
  const drawerBody = (
    <>
      {header}
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {msgs.length === 0 ? (
          <p className="pt-8 text-center text-xs text-muted">아직 메시지가 없습니다.</p>
        ) : (
          msgs.map((m) => renderMessage(m))
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
            onKeyDown={(e) => onInputKey(e, recipientId)}
            maxLength={1000}
            placeholder={recipientId === 0 ? "메시지…" : "귓말…"}
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-gold/60"
          />
          <button type="button" onClick={() => sendTo(recipientId)} disabled={!text.trim()} className="rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-bg disabled:opacity-40">
            전송
          </button>
        </div>
      </div>
    </>
  );

  // ── 대화 목록 한 줄 ──
  const convoRow = (key: number, title: string, accent: boolean) => {
    const list = threadMsgs(key);
    const last = list.length ? list[list.length - 1] : null;
    const n = unreadOf(key, list);
    const active = key === activeThread;
    return (
      <button
        key={key}
        type="button"
        onClick={() => selectThread(key)}
        className={`flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors ${
          active ? "bg-surface-2" : "hover:bg-surface-2/60"
        }`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          accent ? "bg-gold/20 text-gold" : "bg-indigo-500/20 text-indigo-200"
        }`}>
          {accent ? "전체" : title.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-1">
            <span className="truncate text-sm font-medium">{title}</span>
            {last && <span className="shrink-0 text-[10px] text-muted">{fmt(last.createdAt)}</span>}
          </span>
          <span className="truncate text-xs text-muted">
            {last ? `${last.userId === meId ? "나: " : ""}${last.body}` : accent ? "공개 대화" : "귓말 없음"}
          </span>
        </span>
        {n > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-bg">
            {n > 99 ? "99+" : n}
          </span>
        )}
      </button>
    );
  };

  // ── 크게 보기(전체화면): 분할 뷰 ──
  const activeTitle = activeThread === 0 ? "전체 채팅" : others.find((o) => o.userId === activeThread)?.nickname ?? "귓말";
  const paneMsgs = threadMsgs(activeThread);
  const splitBody = (
    <>
      {header}
      <div className="flex min-h-0 flex-1">
        {/* 대화 목록 */}
        <aside className={`w-full flex-col border-border sm:w-60 sm:shrink-0 sm:border-r ${showPaneMobile ? "hidden sm:flex" : "flex"}`}>
          <div className="flex-1 overflow-y-auto">
            {convoRow(0, "전체 채팅", true)}
            {others.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted">귓말할 멤버가 없습니다.</p>
            ) : (
              // 최근 대화 우선, 없으면 이름순
              [...others]
                .sort((a, b) => {
                  const la = threadMsgs(a.userId).at(-1)?.id ?? 0;
                  const lb = threadMsgs(b.userId).at(-1)?.id ?? 0;
                  if (la !== lb) return lb - la;
                  return a.nickname.localeCompare(b.nickname);
                })
                .map((o) => convoRow(o.userId, o.nickname, false))
            )}
          </div>
        </aside>

        {/* 선택된 스레드 */}
        <section className={`min-w-0 flex-1 flex-col ${showPaneMobile ? "flex" : "hidden sm:flex"}`}>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <button type="button" onClick={() => setShowPaneMobile(false)} className="rounded p-1 text-muted hover:text-text sm:hidden" title="목록">
              ← 목록
            </button>
            <span className="truncate text-sm font-medium">{activeTitle}</span>
            {activeThread !== 0 && <span className="shrink-0 text-[11px] text-indigo-300">귓말</span>}
          </div>
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {paneMsgs.length === 0 ? (
              <p className="pt-8 text-center text-xs text-muted">
                {activeThread === 0 ? "아직 메시지가 없습니다." : `${activeTitle}님과의 귓말이 없습니다. 아래에 입력해 시작하세요.`}
              </p>
            ) : (
              paneMsgs.map((m) => renderMessage(m, true))
            )}
          </div>
          <div className="border-t border-border p-2">
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => onInputKey(e, activeThread)}
                maxLength={1000}
                placeholder={activeThread === 0 ? "전체에게 메시지…" : `${activeTitle}에게 귓말…`}
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-gold/60"
              />
              <button type="button" onClick={() => sendTo(activeThread)} disabled={!text.trim()} className="rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-bg disabled:opacity-40">
                전송
              </button>
            </div>
          </div>
        </section>
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
          {drawerBody}
        </div>
      )}

      <Modal
        open={open && expanded}
        onClose={() => setExpanded(false)}
        panelClassName="flex h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
      >
        {splitBody}
      </Modal>
    </>
  );
}
