export function Badge({ label, color }: { label: string; color?: string }) {
  if (!color) {
    return (
      <span className="inline-flex items-center rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-muted">
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {label}
    </span>
  );
}
