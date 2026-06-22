import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/lib/games";
import { getRoomByGameId } from "@/lib/rooms";
import { charactersForSheet, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { PickGrid } from "@/components/PickGrid";

export const dynamic = "force-dynamic";
export const metadata = { title: "직업 선택" };

/**
 * 플레이어용 직업 그리드 — 능력으로 직업을 직접 골라야 할 때 ST가 폰을 들이밀어 보여준다.
 * 선택은 로컬 피드백만이고 어떤 데이터도 저장하지 않는다(엿보기 방지·후행 기록은 ST 별도).
 */
export default async function PickPage({
  params,
}: {
  params: Promise<{ gameId: string; seat: string }>;
}) {
  const { gameId, seat } = await params;
  const game = getGame(gameId);
  if (!game) notFound();
  const seatNum = Number(seat);
  const actor = game.players.find((p) => p.seat === seatNum);
  if (!actor) notFound();

  // 온라인 게임이면 그리모어 백링크를 온라인 보드로 직접(서버 redirect 진동 우회).
  const room = getRoomByGameId(gameId);
  const grimoireHref = room ? `/rooms/${room.id}/play` : `/play/${gameId}`;

  const sheet = getSheet(game.sheetId) ?? getCustomSheet(game.sheetId);
  const chars = sheet ? charactersForSheet(sheet) : [];

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-bg px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-muted">{actor.nickname} · 직업을 선택하세요</p>
          <Link href={grimoireHref} className="text-xs text-muted hover:text-text">
            ← 그리모어
          </Link>
        </div>
        <PickGrid chars={chars} />
      </div>
    </div>
  );
}
