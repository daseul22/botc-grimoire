"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TEAM_MAP } from "@/lib/constants";
import type { Character, Game } from "@/lib/types";

const ALIGN = {
  good: { label: "선 진영", color: "#4a90d9" },
  evil: { label: "악 진영", color: "#d23b3b" },
} as const;

/** 폰용 플레이어 뷰 — 자기 자리 직업만 본다(LAN, 신뢰 기반). 주기적 새로고침. */
export function SeatView({ game, sheetChars }: { game: Game; sheetChars: Character[] }) {
  const router = useRouter();
  const [seat, setSeat] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem(`botc-seat-${game.id}`);
    setSeat(s !== null ? Number(s) : null);
    setLoaded(true);
  }, [game.id]);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);

  const charMap = Object.fromEntries(sheetChars.map((c) => [c.id, c])) as Record<string, Character>;
  const me = game.players.find((p) => p.seat === seat);

  const pick = (s: number) => {
    localStorage.setItem(`botc-seat-${game.id}`, String(s));
    setSeat(s);
  };
  const reset = () => {
    localStorage.removeItem(`botc-seat-${game.id}`);
    setSeat(null);
  };

  if (!loaded) return null;

  // 자리 선택
  if (!me) {
    return (
      <div className="mx-auto max-w-md">
        <p className="mb-1 text-xs text-muted">{game.sheetName}</p>
        <h1 className="mb-4 text-xl font-bold">자리를 선택하세요</h1>
        <div className="grid grid-cols-2 gap-2">
          {game.players.map((p) => (
            <button key={p.seat} type="button" onClick={() => pick(p.seat)} className="rounded-lg border border-border bg-surface px-3 py-3 text-left text-sm hover:border-gold/60">
              {p.nickname}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const ch = charMap[me.characterId];
  const align = ALIGN[me.alignment];
  const dead = me.status === "dead";

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted">{game.sheetName} · {game.day}일차 {game.phase === "night" ? "밤" : "낮"}</p>
        <button type="button" onClick={reset} className="text-xs text-muted hover:text-text">다른 자리</button>
      </div>

      <div className="rounded-2xl border-2 bg-surface p-5 text-center" style={{ borderColor: align.color }}>
        <p className="text-sm text-muted">{me.nickname}</p>
        <div className="mx-auto my-3 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 bg-bg" style={{ borderColor: align.color, opacity: dead ? 0.4 : 1 }}>
          {ch?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ch.image} alt={ch.name.ko} className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl">{ch?.name.en.charAt(0) ?? "?"}</span>
          )}
        </div>
        <h1 className="text-2xl font-bold" style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}>{ch?.name.ko ?? me.characterId}</h1>
        <p className="text-sm text-muted">{ch?.name.en}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold" style={{ background: `${align.color}1f`, color: align.color }}>
          {align.label}
          {ch && <span className="opacity-70">· {TEAM_MAP[ch.team]?.label.ko}</span>}
        </div>
        {dead && <p className="mt-3 font-bold text-red-400">☠ 당신은 사망했습니다</p>}
      </div>

      {ch?.ability.ko && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="mb-1 text-xs font-semibold text-muted">능력</p>
          <p className="text-sm leading-relaxed">{ch.ability.ko}</p>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-muted">5초마다 자동 갱신 · 이야기꾼 화면이 아닌 내 정보만 표시됩니다</p>
    </div>
  );
}
