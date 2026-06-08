import { CharacterBrowser } from "@/components/CharacterBrowser";
import { characters } from "@/lib/data";

export default function Home() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">
        직업 <span className="text-base font-normal text-muted">Characters</span>
      </h1>
      <p className="mb-6 text-sm text-muted">
        시계탑에 흐른 피의 모든 직업을 분류 · 에디션별로 찾아보세요.
      </p>
      <CharacterBrowser characters={characters} />
    </div>
  );
}
