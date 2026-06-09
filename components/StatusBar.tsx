import { TEAM_MAP } from "@/lib/constants";
import type { Character, Game } from "@/lib/types";

/** 생존·진영 카운트 + 승리조건 힌트(참고용). 계산만, 저장 없음. */
export function StatusBar({
  game,
  charMap,
}: {
  game: Game;
  charMap: Record<string, Character>;
}) {
  // 여행자는 승리 판정에서 제외
  const counted = game.players.filter((p) => charMap[p.characterId]?.team !== "traveller");
  const alive = counted.filter((p) => p.status !== "dead");
  const aliveGood = alive.filter((p) => p.alignment === "good").length;
  const aliveEvil = alive.filter((p) => p.alignment === "evil").length;
  const aliveDemon = alive.filter((p) => charMap[p.characterId]?.team === "demon").length;

  // 팀별 분포(전체 - 셋업 보정 검사용). 여행자 포함 X.
  const byTeam: Record<string, number> = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const p of counted) {
    const t = charMap[p.characterId]?.team;
    if (t && byTeam[t] != null) byTeam[t]++;
  }

  let hint: { text: string; color: string } | null = null;
  if (aliveDemon === 0) {
    hint = { text: "악마 전멸 — 선 진영 승리 조건", color: "#4a90d9" };
  } else if (aliveEvil >= aliveGood) {
    hint = { text: "악 ≥ 선 — 악 진영 승리 조건", color: "#d23b3b" };
  } else if (alive.length <= 3) {
    hint = { text: "생존 3명 이하 — 종반", color: "#d4a23a" };
  }

  const Chip = ({ label, n, color }: { label: string; n: number; color?: string }) => (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5">
      <span className="text-muted">{label}</span>
      <span className="font-semibold" style={{ color }}>{n}</span>
    </span>
  );

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
      <Chip label="생존" n={alive.length} />
      <Chip label="선" n={aliveGood} color={TEAM_MAP.townsfolk?.color} />
      <Chip label="악" n={aliveEvil} color="#d23b3b" />
      <Chip label="악마" n={aliveDemon} color={TEAM_MAP.demon?.color} />
      <span className="mx-0.5 text-muted">·</span>
      {/* 팀 분포: 셋업 보정 검사용(남작 등 모디파이어 적용 후 인플레이 카운트가 시트와 맞는지) */}
      <Chip label="마을" n={byTeam.townsfolk} color={TEAM_MAP.townsfolk?.color} />
      <Chip label="외부" n={byTeam.outsider} color={TEAM_MAP.outsider?.color} />
      <Chip label="하수" n={byTeam.minion} color={TEAM_MAP.minion?.color} />
      <Chip label="데몬" n={byTeam.demon} color={TEAM_MAP.demon?.color} />
      {hint && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium" style={{ background: `${hint.color}1f`, color: hint.color, border: `1px solid ${hint.color}66` }}>
          ⚑ {hint.text}
        </span>
      )}
    </div>
  );
}
