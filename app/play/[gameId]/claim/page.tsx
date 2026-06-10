import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getGame, getClaims } from "@/lib/games";
import { charactersForSheet, getCharacter, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { claimSeatAction } from "@/app/play/actions";
import { ClaimCard, Expired } from "@/components/ClaimCard";
import type { Character } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "직업 확인" };

// 점유 후 직업을 보여주는 시간. 이후 서버가 만료시켜 새로고침해도 안 보인다.
const CLAIM_TTL_MS = 30_000;

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = getGame(gameId);
  if (!game) notFound();

  const claims = getClaims(gameId);
  const claimedSeats = Object.keys(claims).map(Number);
  const jar = await cookies();
  const mineRaw = jar.get(`botc-claim-${gameId}`)?.value;
  const mineSeat = mineRaw != null ? Number(mineRaw) : null;
  // 점유 쿠키가 있고 그 좌석이 실제로 점유 상태일 때만 내 카드. (재추첨 등으로 리셋되면 다시 선택)
  const mineClaimedAt = mineSeat != null ? claims[mineSeat] : undefined;
  const me =
    mineSeat != null && mineClaimedAt != null
      ? game.players.find((p) => p.seat === mineSeat)
      : undefined;
  const remainingMs = mineClaimedAt != null ? CLAIM_TTL_MS - (Date.now() - mineClaimedAt) : 0;

  const sheet = getSheet(game.sheetId) ?? getCustomSheet(game.sheetId);
  const map = new Map<string, Character>();
  if (sheet) for (const c of charactersForSheet(sheet)) map.set(c.id, c);
  for (const p of game.players)
    if (!map.has(p.characterId)) {
      const c = getCharacter(p.characterId);
      if (c) map.set(c.id, c);
    }

  // 헤더 없는 전체화면(다른 페이지로 못 빠져나가게 오버레이로 덮는다)
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-bg px-4 py-8">
      <div className="mx-auto max-w-md">
        {me ? (
          remainingMs > 0 ? (
            <>
              <p className="mb-3 text-center text-xs text-muted">
                {game.sheetName} · {game.day}일차 {game.phase === "night" ? "밤" : "낮"}
              </p>
              <ClaimCard
                me={me}
                ch={map.get(game.disguises?.[me.seat] ?? me.characterId)}
                disguised={!!game.disguises?.[me.seat] && game.disguises[me.seat] !== me.characterId}
                remainingMs={remainingMs}
              />
            </>
          ) : (
            <Expired />
          )
        ) : (
          <>
            <p className="mb-1 text-xs text-muted">{game.sheetName}</p>
            <h1 className="mb-1 text-xl font-bold">자기 닉네임을 선택하세요</h1>
            <p className="mb-4 text-xs text-muted">
              선택하면 30초간만 직업이 보이고, 이후 잠깁니다. 다른 사람은 그 자리를 열 수 없습니다.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {game.players.map((p) => {
                const taken = claimedSeats.includes(p.seat);
                if (taken) {
                  return (
                    <div
                      key={p.seat}
                      className="rounded-lg border border-border bg-surface/40 px-3 py-3 text-sm text-muted opacity-50"
                    >
                      {p.nickname}
                      <span className="ml-1 text-[11px]">· 확인됨🔒</span>
                    </div>
                  );
                }
                return (
                  <form key={p.seat} action={claimSeatAction.bind(null, gameId, p.seat)}>
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-3 text-left text-sm hover:border-gold/60"
                    >
                      {p.nickname}
                    </button>
                  </form>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
