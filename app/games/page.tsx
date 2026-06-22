import { listGames } from "@/lib/games";
import { onlineGameIds } from "@/lib/rooms";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { GamesBrowser } from "@/components/GamesBrowser";

// 게임은 진행 진입 시점부터 DB에 저장됨 → 항상 최신 목록을 보여준다
export const dynamic = "force-dynamic";

export const metadata = { title: "내역 — Games" };

export default async function GamesPage() {
  const user = await getCurrentUser();
  const admin = isAdmin(user);

  // 가시성: 종료된 게임은 누구나(익명 포함) 복기 열람 가능.
  //         진행 중 게임은 그 게임을 시작한 이야기꾼 본인 또는 관리자만 보인다
  //         (다른 이야기꾼의 진행 중 게임은 노출하지 않음).
  // 관리(복제·삭제·이름변경): 소유자 본인 또는 관리자.
  // 온라인(룸) 게임은 별도 페이지(/rooms)에서 다룬다 — 여기 LAN 내역에서는 제외.
  const online = onlineGameIds();
  const games = listGames()
    .filter((g) => !online.has(g.id))
    .filter((g) => {
      if (g.status === "finished") return true;
      return admin || (!!user && g.ownerId != null && g.ownerId === user.id);
    })
    .map((g) => ({
      ...g,
      canManage: admin || (!!user && g.ownerId != null && g.ownerId === user.id),
    }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">
        내역 <span className="text-base font-normal text-muted">Games</span>
      </h1>
      <p className="mb-6 text-sm text-muted">
        종료된 게임은 누구나 복기할 수 있습니다. 진행 중인 게임은 시작한 이야기꾼 본인에게만
        보이며, 이어서 진행·복제·삭제할 수 있습니다.
      </p>

      <GamesBrowser games={games} />
    </div>
  );
}
