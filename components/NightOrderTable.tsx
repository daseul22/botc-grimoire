import type { Character } from "@/lib/types";

export function NightOrderTable({
  characters,
  phase,
}: {
  characters: Character[];
  phase: "firstNight" | "otherNight";
}) {
  const rows = characters
    .map((c) => ({ c, n: c[phase] }))
    .filter((r): r is { c: Character; n: NonNullable<Character["firstNight"]> } =>
      Boolean(r.n),
    )
    .sort((a, b) => a.n.order - b.n.order);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">이 단계에 행동하는 직업이 없습니다.</p>
    );
  }

  return (
    <ol className="space-y-1">
      {rows.map(({ c, n }) => (
        <li key={c.id} className="flex gap-3 text-sm">
          <span className="w-8 shrink-0 tabular-nums text-muted">{n.order}</span>
          <span className="font-medium">{c.name.ko}</span>
          {n.reminder && (
            <span className="text-muted">— {n.reminder.ko}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
