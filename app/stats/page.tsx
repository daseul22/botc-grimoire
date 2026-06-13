import { listFinishedGames, nicknameLeaderboard } from "@/lib/games";
import { getCharacter } from "@/lib/data";
import type { Character } from "@/lib/types";
import { StatsView } from "@/components/StatsView";

// 종료 게임에서 파생 → 항상 최신
export const dynamic = "force-dynamic";

export const metadata = { title: "통계 — Stats" };

export default function StatsPage() {
  const games = listFinishedGames();
  const leaderboard = nicknameLeaderboard();

  // 등장하는 직업의 상세를 클라이언트에 함께 전달(토큰 아이콘·이름용)
  const ids = new Set<string>();
  for (const g of games) for (const p of g.players) ids.add(p.characterId);
  for (const s of leaderboard) for (const id of Object.keys(s.roleCounts)) ids.add(id);
  const chars: Record<string, Character> = {};
  for (const id of ids) {
    const c = getCharacter(id);
    if (c) chars[id] = c;
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">
        통계 <span className="text-base font-normal text-muted">Stats</span>
      </h1>
      <p className="mb-6 text-sm text-muted">
        종료된 게임 기록으로 집계합니다. 게임 카드를 누르면 복기로 이동합니다.
      </p>
      <StatsView games={games} leaderboard={leaderboard} chars={chars} />
    </div>
  );
}
