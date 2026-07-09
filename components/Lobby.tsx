"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TEAM_MAP } from "@/lib/constants";
import {
  CORE_TEAMS,
  defaultRatio,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ratioTotal,
  type CoreTeam,
  type Ratio,
} from "@/lib/ratio";
import {
  assignSeatAction,
  closeRoomAction,
  heartbeatRoomAction,
  kickMemberAction,
  leaveRoomAction,
  sendInviteAction,
  startRoomAction,
} from "@/app/rooms/actions";
import { useRoomStream } from "./useGameStream";
import { ChatWidget } from "./ChatWidget";
import { Select } from "./Select";

export type LobbyChar = { id: string; nameKo: string; team: string; ability: string; image?: string };
export type LobbyInvite = { id: string; nickname: string; status: string };
type LobbyMember = {
  userId: number;
  nickname: string;
  role: "storyteller" | "player" | "spectator";
  seat: number | null;
  color: string;
};
type LobbyRoom = {
  id: string;
  code: string;
  sheetName: string;
  status: "lobby" | "started" | "closed";
  gameId: string | null;
  members: LobbyMember[];
};

export function Lobby({
  room,
  meId,
  isOwner,
  chars,
  invites,
}: {
  room: LobbyRoom;
  meId: number;
  isOwner: boolean;
  chars: LobbyChar[];
  invites: LobbyInvite[];
}) {
  const router = useRouter();

  // 실시간: 로비 변경마다 서버 컴포넌트 재요청. 시작/멤버/좌석이 즉시 반영된다.
  useRoomStream(room.id, () => router.refresh());

  // 접속 생존 신호(20초).
  useEffect(() => {
    const t = setInterval(() => {
      void heartbeatRoomAction(room.id);
    }, 20000);
    return () => clearInterval(t);
  }, [room.id]);

  // 시작되면 게임 화면으로 이동(서버도 리다이렉트하지만, 로비에 머문 클라를 위해 보조). 온라인 라우트.
  useEffect(() => {
    if (room.status === "started") {
      router.replace(isOwner ? `/rooms/${room.id}/play` : `/rooms/${room.id}/seat`);
    }
  }, [room.status, room.id, isOwner, router]);

  const players = room.members.filter((m) => m.role !== "storyteller");
  const storyteller = room.members.find((m) => m.role === "storyteller");
  const me = room.members.find((m) => m.userId === meId);

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <Header room={room} />

      {isOwner ? (
        <OwnerView room={room} players={players} chars={chars} invites={invites} />
      ) : (
        <PlayerView room={room} me={me} storyteller={storyteller} players={players} />
      )}

      <ChatWidget
        roomId={room.id}
        meId={meId}
        members={room.members.map((m) => ({ userId: m.userId, nickname: m.nickname }))}
        memberColors={Object.fromEntries(room.members.map((m) => [m.userId, m.color]))}
        canEditColors={isOwner}
      />
    </div>
  );
}

function Header({ room }: { room: LobbyRoom }) {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/rooms/join/${room.code}` : "";

  return (
    <div className="mb-6">
      <p className="text-xs text-muted">대기실</p>
      <h1 className="mb-3 text-2xl font-bold">{room.sheetName}</h1>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
        <div>
          <p className="text-xs text-muted">입장 코드</p>
          <p className="font-mono text-lg font-bold tracking-widest text-gold">{room.code}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!shareUrl) return;
            void navigator.clipboard?.writeText(shareUrl).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-gold/60"
        >
          {copied ? "복사됨!" : "입장 링크 복사"}
        </button>
        <p className="text-xs text-muted">디스코드에 코드나 링크를 공유하세요.</p>
      </div>
    </div>
  );
}

// ── 이야기꾼(방장) ──
function OwnerView({
  room,
  players,
  chars,
  invites,
}: {
  room: LobbyRoom;
  players: LobbyMember[];
  chars: LobbyChar[];
  invites: LobbyInvite[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // 낙관적 좌석/멤버 상태 — 서버 갱신(router.refresh) 전까지 즉시 반영해 선택 시 깜빡임/지연 제거.
  // 좌석·멤버 "내용"이 바뀔 때만 서버 값으로 동기화(매 렌더 새 배열이라 참조비교 대신 시그니처 비교).
  const [local, setLocal] = useState(players);
  const sig = players.map((p) => `${p.userId}:${p.seat}`).join("|");
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) {
    setLastSig(sig);
    setLocal(players);
  }

  const assignSeat = (userId: number, seat: number | null) => {
    setLocal((prev) =>
      prev.map((p) =>
        p.userId === userId
          ? { ...p, seat }
          : seat != null && p.seat === seat
            ? { ...p, seat: null } // 같은 좌석을 가진 다른 멤버는 비움(서버 동작 미러)
            : p,
      ),
    );
    startTransition(async () => {
      await assignSeatAction(room.id, userId, seat);
      router.refresh();
    });
  };
  const kickMember = (userId: number) => {
    setLocal((prev) => prev.filter((p) => p.userId !== userId));
    startTransition(async () => {
      await kickMemberAction(room.id, userId);
      router.refresh();
    });
  };

  const seatedCount = local.filter((p) => p.seat != null).length;

  return (
    <>
      <InvitePanel roomId={room.id} invites={invites} />
      <SeatingPanel players={local} onAssign={assignSeat} onKick={kickMember} />
      <StartPanel roomId={room.id} seatedCount={seatedCount} chars={chars} />
      <div className="mt-6">
        <DangerButton
          label="방 닫기"
          confirm="방을 닫으면 모두 나가집니다. 닫을까요?"
          action={() => closeRoomAction(room.id)}
        />
      </div>
    </>
  );
}

function InvitePanel({ roomId, invites }: { roomId: string; invites: LobbyInvite[] }) {
  const [nick, setNick] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [pending, startTransition] = useTransition();

  function send() {
    const n = nick.trim();
    if (!n) return;
    setMsg({});
    startTransition(async () => {
      const res = await sendInviteAction(roomId, n);
      if ("error" in res) setMsg({ err: res.error });
      else {
        setMsg({ ok: `'${n}' 초대함` });
        setNick("");
      }
    });
  }

  return (
    <section className="mb-5 rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">가입자 초대</h2>
      <div className="flex gap-2">
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="가입 닉네임"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-gold/60"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !nick.trim()}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          초대
        </button>
      </div>
      {msg.err && <p className="mt-2 text-xs text-red-400">{msg.err}</p>}
      {msg.ok && <p className="mt-2 text-xs text-green-400">{msg.ok}</p>}
      {invites.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {invites.map((i) => (
            <li
              key={i.id}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
            >
              {i.nickname}
              <span className="ml-1 opacity-70">
                {i.status === "pending" ? "· 대기" : i.status === "accepted" ? "· 참가" : "· 거절"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeatingPanel({
  players,
  onAssign,
  onKick,
}: {
  players: LobbyMember[];
  onAssign: (userId: number, seat: number | null) => void;
  onKick: (userId: number) => void;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold text-muted">
        참가자 좌석 배정 <span className="font-normal">({players.length}명)</span>
      </h2>
      {players.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted">
          아직 참가자가 없습니다. 코드·링크·초대로 모아주세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.userId}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2.5"
            >
              <span className="truncate text-sm">{p.nickname}</span>
              <div className="flex items-center gap-2">
                <Select
                  value={p.seat ?? -1}
                  ariaLabel={`${p.nickname} 좌석`}
                  onChange={(v) => onAssign(p.userId, v === -1 ? null : v)}
                  options={[
                    { value: -1, label: "관전" },
                    ...Array.from({ length: MAX_PLAYERS }, (_, i) => ({ value: i, label: `좌석 ${i + 1}` })),
                  ]}
                  className="w-28"
                />
                <button
                  type="button"
                  onClick={() => onKick(p.userId)}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted hover:text-red-400"
                  title="내보내기"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StartPanel({
  roomId,
  seatedCount,
  chars,
}: {
  roomId: string;
  seatedCount: number;
  chars: LobbyChar[];
}) {
  const [counts, setCounts] = useState<Ratio>(() => defaultRatio(Math.max(MIN_PLAYERS, seatedCount)));
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showExclude, setShowExclude] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  // 좌석 인원이 바뀌면 추천 비율로 갱신.
  useEffect(() => {
    if (seatedCount >= MIN_PLAYERS) setCounts(defaultRatio(seatedCount));
  }, [seatedCount]);

  const coreByTeam = useMemo(() => {
    const m: Record<CoreTeam, LobbyChar[]> = { townsfolk: [], outsider: [], minion: [], demon: [] };
    for (const c of chars)
      if ((CORE_TEAMS as string[]).includes(c.team)) m[c.team as CoreTeam].push(c);
    return m;
  }, [chars]);
  const available = useMemo(() => {
    const a = {} as Record<CoreTeam, number>;
    for (const t of CORE_TEAMS) a[t] = coreByTeam[t].filter((c) => !excluded.has(c.id)).length;
    return a;
  }, [coreByTeam, excluded]);

  const sum = ratioTotal(counts);
  const tooFew = seatedCount < MIN_PLAYERS;
  const sumOk = sum === seatedCount;
  const enoughChars = CORE_TEAMS.every((t) => counts[t] <= available[t]);
  const canStart = !tooFew && sumOk && enoughChars && !pending;

  function start() {
    setError(undefined);
    startTransition(async () => {
      const res = await startRoomAction(roomId, { excludedIds: [...excluded], counts });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <section className="rounded-lg border border-gold/40 bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">게임 시작</h2>

      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted">
            직업군 비율
            <button
              type="button"
              onClick={() => setCounts(defaultRatio(Math.max(MIN_PLAYERS, seatedCount)))}
              className="rounded border border-border px-2 py-0.5 hover:text-text"
            >
              자동
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {CORE_TEAMS.map((t) => {
              const meta = TEAM_MAP[t];
              const over = counts[t] > available[t];
              return (
                <label key={t} className="text-xs">
                  <span className="mb-0.5 block" style={{ color: meta.color }}>
                    {meta.label.ko}
                    <span className="ml-1 text-muted">/{available[t]}</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={counts[t]}
                    onChange={(e) =>
                      setCounts((prev) => ({ ...prev, [t]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className={`w-16 rounded-lg border bg-bg px-2 py-1.5 outline-none ${
                      over ? "border-red-500/70" : "border-border"
                    }`}
                  />
                </label>
              );
            })}
          </div>
        </div>
        <p className={`text-sm ${sumOk ? "text-muted" : "text-red-400"}`}>
          합계 {sum} / 좌석 {seatedCount}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowExclude((s) => !s)}
        className="mb-2 text-xs text-muted underline-offset-2 hover:text-text hover:underline"
      >
        제외할 직업 {showExclude ? "접기" : `펼치기 (${excluded.size})`}
      </button>
      {showExclude && (
        <div className="mb-3 space-y-3">
          {CORE_TEAMS.map((t) => {
            const meta = TEAM_MAP[t];
            const list = coreByTeam[t];
            if (list.length === 0) return null;
            return (
              <div key={t}>
                <h3 className="mb-1 text-xs font-medium" style={{ color: meta.color }}>
                  {meta.label.ko}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((c) => {
                    const ex = excluded.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        title={c.ability}
                        onClick={() =>
                          setExcluded((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                        className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                          ex
                            ? "border-border text-muted line-through opacity-50"
                            : "border-border bg-bg hover:bg-surface"
                        }`}
                      >
                        {c.nameKo}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {tooFew
            ? `좌석에 최소 ${MIN_PLAYERS}명을 배정하세요`
            : !sumOk
              ? "비율 합과 좌석 인원을 맞추세요"
              : !enoughChars
                ? "직업 수가 부족한 직업군이 있습니다"
                : "시작 준비 완료"}
          {error && <span className="ml-2 text-red-400">{error}</span>}
        </span>
        <button
          type="button"
          onClick={start}
          disabled={!canStart}
          className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {pending ? "시작 중…" : "게임 시작"}
        </button>
      </div>
    </section>
  );
}

// ── 플레이어 ──
function PlayerView({
  room,
  me,
  storyteller,
  players,
}: {
  room: LobbyRoom;
  me: LobbyMember | undefined;
  storyteller: LobbyMember | undefined;
  players: LobbyMember[];
}) {
  // 시작 시 좌석은 로비 좌석 순서대로 0..n-1로 재배치된다. 그래서 로비의 원시 좌석번호 대신
  // "좌석 배정된 사람들 중 순위(=실제 게임 좌석 번호)"를 보여줘 로비↔게임 번호 불일치를 없앤다.
  const seated = players
    .filter((p) => p.seat != null)
    .sort((a, b) => (a.seat as number) - (b.seat as number));
  const gameSeat = new Map(seated.map((p, i) => [p.userId, i + 1]));

  return (
    <>
      <section className="mb-5 rounded-lg border border-border bg-surface p-4 text-center">
        {me?.seat != null ? (
          <p className="text-lg font-semibold">
            내 자리 · <span className="text-gold">좌석 {gameSeat.get(me.userId)}</span>
          </p>
        ) : (
          <p className="text-sm text-muted">아직 자리가 배정되지 않았습니다. 잠시 기다려 주세요.</p>
        )}
        <p className="mt-1 text-xs text-muted">
          이야기꾼({storyteller?.nickname ?? "?"})이 시작하면 자동으로 게임 화면으로 이동합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted">참가자 ({players.length}명)</h2>
        <ul className="space-y-1.5">
          {players.map((p) => (
            <li
              key={p.userId}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                p.userId === me?.userId ? "border-gold/50 bg-surface" : "border-border bg-surface"
              }`}
            >
              <span className="truncate">
                {p.nickname}
                {p.userId === me?.userId && <span className="ml-1 text-xs text-gold">(나)</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {p.seat != null ? `좌석 ${gameSeat.get(p.userId)}` : "대기"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <DangerButton label="방 나가기" confirm="방에서 나갈까요?" action={() => leaveRoomAction(room.id)} />
    </>
  );
}

function DangerButton({
  label,
  confirm,
  action,
}: {
  label: string;
  confirm: string;
  action: () => Promise<{ error: string } | void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirm)) return;
          setError(undefined);
          startTransition(async () => {
            const res = await action();
            if (res?.error) setError(res.error);
          });
        }}
        className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-red-500/60 hover:text-red-400 disabled:opacity-40"
      >
        {label}
      </button>
      {error && <span className="ml-2 text-xs text-red-400">{error}</span>}
    </div>
  );
}
