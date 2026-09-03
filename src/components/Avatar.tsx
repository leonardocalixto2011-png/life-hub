import { initials } from "@/lib/format";

export function Avatar({
  name,
  email,
  size = 22,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
}) {
  return (
    <span
      title={name ?? email ?? undefined}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] font-semibold text-[var(--color-text-dim)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials(name, email)}
    </span>
  );
}
