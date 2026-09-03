export function VentureChip({
  name,
  color,
}: {
  name: string;
  color?: string | null;
}) {
  return (
    <span className="chip">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color ?? "var(--color-text-dim)" }}
      />
      {name}
    </span>
  );
}
