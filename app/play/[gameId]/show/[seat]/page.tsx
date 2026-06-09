import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/lib/games";
import { charactersForSheet, getCharacter, getSheet } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { specForPhase } from "@/lib/night-actions";
import { TEAM_MAP } from "@/lib/constants";
import type { Character } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "결과 보이기" };

/**
 * 행동 결과 풀스크린 페이지 — 이야기꾼이 플레이어에게 폰/화면을 들이밀어 보여주는 용도.
 * 정보 직업(세탁부/사서/수사관: 직업 토큰 + 지목 2명, 점쟁이: 예/아니오 + 지목 2명,
 * 공감자/요리사: 숫자, 장의사: 직업 토큰)을 모두 같은 패턴으로 큼지막하게 렌더.
 */
export default async function ShowPage({
  params,
}: {
  params: Promise<{ gameId: string; seat: string }>;
}) {
  const { gameId, seat: seatStr } = await params;
  const seat = Number(seatStr);
  const game = getGame(gameId);
  if (!game) notFound();
  const actor = game.players.find((p) => p.seat === seat);
  if (!actor) notFound();

  const sheet = getSheet(game.sheetId) ?? getCustomSheet(game.sheetId);
  const map = new Map<string, Character>();
  if (sheet) for (const c of charactersForSheet(sheet)) map.set(c.id, c);
  for (const p of game.players)
    if (!map.has(p.characterId)) {
      const c = getCharacter(p.characterId);
      if (c) map.set(c.id, c);
    }

  const actorChar = map.get(actor.characterId);
  const record = game.actions.find((a) => a.actorSeat === seat && !a.bluff);
  const spec = specForPhase(actor.characterId, game.phase ?? "night");

  const targetSeats = record?.targets ?? [];
  const targetNames = targetSeats.map(
    (s) => game.players.find((p) => p.seat === s)?.nickname ?? `${s}`,
  );
  const resultStr = record?.result ?? "";
  const resultChar = spec.result === "role" && resultStr ? map.get(resultStr) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 py-8">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        <p className="mb-2 text-center text-xs text-muted">
          {actorChar?.name.ko ?? actor.characterId} · {actor.nickname}
        </p>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          {!record ? (
            <p className="text-base text-muted">아직 행동이 기록되지 않았습니다.</p>
          ) : (
            <>
              {spec.result === "role" && resultChar && (
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="flex h-44 w-44 items-center justify-center overflow-hidden rounded-full border-4 bg-surface"
                    style={{ borderColor: TEAM_MAP[resultChar.team]?.color }}
                  >
                    {resultChar.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resultChar.image}
                        alt={resultChar.name.ko}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl">{resultChar.name.en.charAt(0)}</span>
                    )}
                  </div>
                  <h1
                    className="text-center text-3xl font-bold leading-tight"
                    style={{ color: TEAM_MAP[resultChar.team]?.color }}
                  >
                    {resultChar.name.ko}
                  </h1>
                  <p className="text-sm text-muted">{resultChar.name.en}</p>
                </div>
              )}

              {spec.result === "yesno" && (
                <div
                  className={`text-7xl font-black ${
                    resultStr === "yes" ? "text-green-400" : resultStr === "no" ? "text-red-400" : "text-muted"
                  }`}
                >
                  {resultStr === "yes" ? "예" : resultStr === "no" ? "아니오" : "—"}
                </div>
              )}

              {spec.result === "number" && (
                <div className="text-9xl font-black text-gold">{resultStr || "—"}</div>
              )}

              {spec.result === "team" && (
                <div
                  className="text-7xl font-black"
                  style={{ color: resultStr === "evil" ? "#d23b3b" : "#4a90d9" }}
                >
                  {resultStr === "evil" ? "악" : resultStr === "good" ? "선" : "—"}
                </div>
              )}

              {spec.result === "text" && (
                <p className="break-words text-center text-2xl font-medium text-text">
                  {resultStr || "—"}
                </p>
              )}

              {spec.result === "none" && !resultChar && (
                <p className="text-base text-muted">결과 항목이 없는 능력입니다.</p>
              )}

              {targetSeats.length > 0 && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted">지목된 자리</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {targetNames.map((n, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-surface-2 px-4 py-1.5 text-base font-medium text-text"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href={`/play/${gameId}`} className="text-muted hover:text-text">
            ← 그리모어
          </Link>
          <span className="text-xs text-muted">{game.day}일차 {game.phase === "night" ? "밤" : "낮"}</span>
        </div>
      </div>
    </div>
  );
}
