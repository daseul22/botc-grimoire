import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

export const metadata = { title: "온라인 가이드 — Player Guide" };

// docs/player-guide-online.md를 읽어 marked로 렌더한다. 이미지는 /public/guide/online/* 정적 파일.
// h3(상황) 제목으로 좌측 목차를 만들고, 렌더된 h3에 순서대로 앵커 id를 부여한다.
export default async function GuidePage() {
  const md = readFileSync(join(process.cwd(), "docs", "player-guide-online.md"), "utf8");
  const headings = [...md.matchAll(/^###\s+(.+)$/gm)].map((m, i) => ({ id: `g${i}`, title: m[1].trim() }));
  let idx = 0;
  const html = (await marked.parse(md)).replace(/<h3>/g, () => `<h3 id="g${idx++}">`);

  return (
    <div className="mx-auto max-w-5xl lg:flex lg:items-start lg:gap-8">
      <nav className="mb-8 rounded-lg border border-border bg-surface p-4 text-sm lg:sticky lg:top-20 lg:mb-0 lg:max-h-[80vh] lg:w-56 lg:shrink-0 lg:overflow-y-auto">
        <p className="mb-2 font-semibold text-muted">목차</p>
        <ol className="space-y-1">
          {headings.map((h) => (
            <li key={h.id}>
              <a href={`#${h.id}`} className="block text-muted hover:text-gold">
                {h.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <article className="guide-prose min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
