import { initials } from "@/lib/format";

/**
 * A person's profile photo when they set one (/account), their initials
 * otherwise. The photo URL is only ever our own Blob host (setAvatar checks
 * it), so it loads under the CSP and leaks nobody's address to a third party.
 */
export function Avatar({
  name,
  email,
  src,
  size = 22,
}: {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  size?: number;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a tiny Blob-hosted photo; next/image adds nothing here
      <img
        src={src}
        alt=""
        title={name ?? undefined}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
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
