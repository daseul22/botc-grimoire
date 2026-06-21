import { TEAM_MAP } from "@/lib/constants";
import { MARKERS } from "@/lib/markers";
import type { Character, Game } from "@/lib/types";

const GLOBAL_MARKERS = MARKERS.filter((m) => m.scope === "global");

/** 라벨 + 숫자 한 쌍(읽기 전용 스탯). */
function Stat({ label, n, color }: { label: string; n: number; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums" style={{ color }}>{n}</span>
    </span>
  );
}

/** 그룹 구분용 세로 디바이더. */
function Divider() {
  return <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />;
}

/** 생존·진영 카운트 + 승리조건 힌트 + 전역 마커(Vortox 등)를 한 패널에 모은 상태바. 계산만, 저장 없음. */
export function StatusBar({
  game,
  charMap,
  onToggleGlobal,
}: {
  game: Game;
  charMap: Record<string, Character>;
  /** 전역 마커 토글(없으면 전역 섹션 숨김 — 읽기 전용 컨텍스트). */
  onToggleGlobal?: (id: string) => void;
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

  const showGlobal = onToggleGlobal && GLOBAL_MARKERS.length > 0;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface/60 px-3 py-2 text-xs">
      {/* 생존 현황 */}
      <Stat label="생존" n={alive.length} />
      <Stat label="선팀" n={aliveGood} color={TEAM_MAP.townsfolk?.color} />
      <Stat label="악팀" n={aliveEvil} color="#d23b3b" />
      <Stat label="악마" n={aliveDemon} color={TEAM_MAP.demon?.color} />

      <Divider />

      {/* 팀 분포: 셋업 보정 검사용(남작 등 모디파이어 적용 후 인플레이 카운트가 시트와 맞는지) */}
      <Stat label="마을주민" n={byTeam.townsfolk} color={TEAM_MAP.townsfolk?.color} />
      <Stat label="외지인" n={byTeam.outsider} color={TEAM_MAP.outsider?.color} />
      <Stat label="하수인" n={byTeam.minion} color={TEAM_MAP.minion?.color} />
      <Stat label="악마" n={byTeam.demon} color={TEAM_MAP.demon?.color} />

      {hint && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
          style={{ background: `${hint.color}1f`, color: hint.color, border: `1px solid ${hint.color}66` }}
        >
          ⚑ {hint.text}
        </span>
      )}

      {/* 전역 마커: Vortox(전체 정보 직업 거짓) 등 게임 전체에 걸치는 효과. 같은 패널 우측에 묶어 표시. */}
      {showGlobal && (
        <div className="ml-auto flex items-center gap-1.5">
          <Divider />
          <span className="text-muted">전역</span>
          {GLOBAL_MARKERS.map((m) => {
            const on = game.globalMarkers.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggleGlobal(m.id)}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors"
                style={
                  on
                    ? { background: `${m.color}22`, color: m.color, borderColor: `${m.color}88` }
                    : { borderColor: "var(--color-border)", color: "var(--color-muted)" }
                }
                title={on ? `${m.label} 해제` : `${m.label} 적용`}
              >
                {m.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.icon} alt="" className="h-4 w-4 rounded-full object-cover" />
                ) : (
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: m.color }}
                  >
                    {m.letter ?? m.label.charAt(0)}
                  </span>
                )}
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
