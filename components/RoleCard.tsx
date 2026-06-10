import { TEAM_MAP } from "@/lib/constants";
import type { Character, GamePlayer } from "@/lib/types";
import { AbilityFocus } from "./AbilityFocus";

const ALIGN = {
  good: { label: "선 진영", color: "#4a90d9" },
  evil: { label: "악 진영", color: "#d23b3b" },
} as const;

/**
 * 내 직업 카드(닉네임·직업·진영·능력). 순수 presentational — 서버/클라 양쪽에서 쓴다.
 * disguised: ch가 가짜 직업(미치광이·주정뱅이·꼭두각시)일 때 — 진영도 실제값 대신
 * 가짜 직업의 팀 기준으로 보여준다(꼭두각시는 "선 진영 · 마을주민"으로 보여야 함).
 */
export function RoleCard({ me, ch, disguised }: { me: GamePlayer; ch?: Character; disguised?: boolean }) {
  const align =
    disguised && ch
      ? ALIGN[ch.team === "minion" || ch.team === "demon" ? "evil" : "good"]
      : ALIGN[me.alignment];
  const dead = me.status === "dead";
  return (
    <>
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

      {ch?.ability.ko && <AbilityFocus ability={ch.ability.ko} />}
    </>
  );
}
