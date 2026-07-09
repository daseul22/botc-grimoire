import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/lib/games";
import { getRoomByGameId } from "@/lib/rooms";
import { characterMapForGame } from "@/lib/game-characters";
import { resolveShowcase } from "@/lib/showcase";
import { ShowcasePayloadView } from "@/components/ShowcasePayloadView";

export const dynamic = "force-dynamic";
export const metadata = { title: "결과 보이기" };

/**
 * 행동 결과 풀스크린 페이지 — ST가 폰/화면을 들이밀어 *받는 사람*에게 정보를 전달(LAN).
 * 무엇을 드러낼지는 lib/showcase의 resolveShowcase가 계산하고(온라인 push와 단일 출처),
 * 렌더는 components/ShowcasePayloadView가 담당(온라인 플레이어 패널과 동일 화면).
 * spec.showcase 배열이면 ?v=N으로 변형 선택(마술사), ?mode=로 특수 화면(블러핑/하수인/악마 정보).
 * 액터 정체는 절대 노출 안 함(룰: 정보 직업의 정체는 받는 사람에게 비밀).
 */
export default async function ShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string; seat: string }>;
  searchParams: Promise<{ v?: string; mode?: string; as?: string }>;
}) {
  const { gameId, seat: seatStr } = await params;
  const { v: vStr, mode, as } = await searchParams;
  const seat = Number(seatStr);
  const variant = Math.max(0, Number(vStr ?? 0) | 0);
  const game = getGame(gameId);
  if (!game) notFound();
  if (!game.players.some((p) => p.seat === seat)) notFound();

  // 온라인(룸) 게임이면 그리모어 백링크는 온라인 보드로 직접 보낸다.
  // LAN 그리모어(/play/[gameId])는 온라인 게임을 서버 redirect()로 되돌리는데,
  // 프리페치된 Link의 소프트 네비게이션에서 무한 진동(/play/[id] ↔ /rooms/[id]/play)하기 때문.
  const room = getRoomByGameId(gameId);
  const grimoireHref = room ? `/rooms/${room.id}/play` : `/play/${gameId}`;

  const map = characterMapForGame(game);
  const payload = resolveShowcase(game, seat, { as, variant, mode }, (id) => map.get(id)?.team);
  if (!payload) notFound();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
          <ShowcasePayloadView payload={payload} getChar={(id) => map.get(id)} />
        </div>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href={grimoireHref} className="text-muted hover:text-text">← 그리모어</Link>
          <span className="text-xs text-muted">{game.day}일차 {game.phase === "night" ? "밤" : "낮"}</span>
        </div>
      </div>
    </div>
  );
}
