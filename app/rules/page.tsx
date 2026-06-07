import { rules } from "@/lib/data";

export const metadata = { title: "규칙 — Rules" };

export default function RulesPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">
        규칙 <span className="text-base font-normal text-muted">Rules</span>
      </h1>
      <p className="mb-6 text-sm text-muted">시계탑에 흐른 피 기본 규칙.</p>

      <nav className="mb-8 rounded-lg border border-border bg-surface p-4">
        <p className="mb-2 text-sm font-semibold text-muted">목차</p>
        <ol className="space-y-1 text-sm">
          {rules.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-muted hover:text-gold">
                {s.order}. {s.title.ko}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-10">
        {rules.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="mb-3 text-xl font-semibold">
              {s.title.ko}
              <span className="ml-2 text-sm font-normal text-muted">
                {s.title.en}
              </span>
            </h2>
            {s.body.ko.split("\n").map(
              (para, i) =>
                para.trim() && (
                  <p key={i} className="mb-3 leading-relaxed text-text/90">
                    {para}
                  </p>
                ),
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
