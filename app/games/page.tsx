import Link from "next/link";
import { listGames, type GameSummary } from "@/lib/games";
import { DeleteGameButton } from "@/components/DeleteGameButton";

// 게임은 진행 진입 시점부터 DB에 저장됨 → 항상 최신 목록을 보여준다
export const dynamic = "force-dynamic";

export const metadata = { title: "내역 — Games" };

function statusText(g: GameSummary): string {
  if (g.status === "finished")
    return `종료 · ${g.result === "good" ? "선 승리" : g.result === "evil" ? "악 승리" : "결과 없음"}`;
  return `진행 중 · ${g.day}일차 ${g.phase === "night" ? "밤" : "낮"}`;
}

export default function GamesPage() {
  const games = listGames();
  const playing = games.filter((g) => g.status !== "finished");
  const finished = games.filter((g) => g.status === "finished");

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">
        내역 <span className="text-base font-normal text-muted">Games</span>
      </h1>
      <p className="mb-6 text-sm text-muted">
        진행 중인 게임은 이어서, 종료된 게임은 복기할 수 있습니다.
      </p>

      {games.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          아직 진행한 게임이 없습니다. 시트에서 <span className="text-gold">시작하기</span>로
          게임을 시작하세요.
        </p>
      ) : (
        <div className="space-y-8">
          {playing.length > 0 && (
            <Section title="진행 중" games={playing} />
          )}
          {finished.length > 0 && (
            <Section title="종료됨" games={finished} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, games }: { title: string; games: GameSummary[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted">
        {title} · {games.length}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g) => {
          const finished = g.status === "finished";
          return (
            <Link
              key={g.id}
              href={`/play/${g.id}`}
              className="relative rounded-lg border border-border bg-surface p-4 transition-colors hover:border-gold/60 hover:bg-surface-2"
            >
              <div className="absolute right-3 top-3">
                <DeleteGameButton id={g.id} />
              </div>
              <h3 className="pr-12 font-semibold">{g.sheetName}</h3>
              <p
                className={`mt-1 text-xs ${finished ? "text-muted" : "text-gold"}`}
              >
                {statusText(g)}
              </p>
              <p className="mt-3 text-xs text-muted">
                {g.playerCount}인 · {g.createdAt.slice(0, 16).replace("T", " ")}
              </p>
              <p className="mt-2 text-xs text-gold/80">
                {finished ? "복기 보기 →" : "이어서 진행 →"}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
