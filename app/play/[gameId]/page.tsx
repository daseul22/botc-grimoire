import { notFound, redirect } from "next/navigation";
import { getGame, getGameOwner, getHistory, listKnownNicknames } from "@/lib/games";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { characterMapForGame } from "@/lib/game-characters";
import { PlayCanvas } from "@/components/PlayCanvas";
import { GameReplay } from "@/components/GameReplay";

export const dynamic = "force-dynamic";

export const metadata = { title: "게임 진행" };

export default async function PlayPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = getGame(gameId);
  if (!game) notFound();

  // 현재 시트의 전체 직업(상세 데이터 포함)을 통째로 넘긴다.
  // 재추첨·직업변경 후에도 클라이언트가 새 직업 정보를 바로 그릴 수 있게 함.
  const sheetChars = [...characterMapForGame(game).values()];

  // 종료된 게임의 복기는 누구나(익명 포함) 볼 수 있다.
  if (game.status === "finished") {
    return (
      <GameReplay game={game} history={getHistory(gameId)} sheetChars={sheetChars} />
    );
  }

  // 진행 중 그리모어 보드(이야기꾼 화면)는 게임을 시작한 이야기꾼 본인 또는 관리자만.
  // (플레이어 폰은 /play/[gameId]/seat·claim 등 별도 경로로 접근 — proxy가 자리에 가둔다.)
  const user = await getCurrentUser();
  const owner = getGameOwner(gameId);
  const canManage = !!user && (isAdmin(user) || (owner != null && owner === user.id));
  if (!canManage) redirect(user ? "/games" : "/login");

  return (
    <PlayCanvas
      game={game}
      sheetChars={sheetChars}
      knownNicknames={listKnownNicknames().map((k) => k.nickname)}
    />
  );
}
