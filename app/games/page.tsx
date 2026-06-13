import { listGames } from "@/lib/games";
import { GamesBrowser } from "@/components/GamesBrowser";

// 게임은 진행 진입 시점부터 DB에 저장됨 → 항상 최신 목록을 보여준다
export const dynamic = "force-dynamic";

export const metadata = { title: "내역 — Games" };

export default function GamesPage() {
  const games = listGames();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">
        내역 <span className="text-base font-normal text-muted">Games</span>
      </h1>
      <p className="mb-6 text-sm text-muted">
        진행 중인 게임은 이어서, 종료된 게임은 복기할 수 있습니다. 게임마다 이름을 지정해
        나중에 구분하세요.
      </p>

      <GamesBrowser games={games} />
    </div>
  );
}
