/**
 * The Life Hub mark — a hub with three people around it — drawn inline so it
 * needs no request and stays sharp at any size. Same artwork as the
 * home-screen icon (scripts/brand/mark.svg); change both together, then run
 * `node scripts/gen-icons.mjs`.
 */
export function Logo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Life Hub"
    >
      <defs>
        <linearGradient id="lh-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b6cf6" />
          <stop offset="0.55" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#2e23a6" />
        </linearGradient>
        <radialGradient id="lh-logo-glow" cx="0.2" cy="0.1" r="0.8">
          <stop offset="0" stopColor="#ffd9a8" stopOpacity="0.6" />
          <stop offset="0.45" stopColor="#ffb3c9" stopOpacity="0.14" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill="url(#lh-logo-bg)" />
      <rect width="1024" height="1024" rx="230" fill="url(#lh-logo-glow)" />
      <circle cx="512" cy="512" r="236" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="44" />
      <circle cx="512" cy="512" r="118" fill="#fff" />
      <circle cx="512" cy="276" r="74" fill="#ffd9a8" />
      <circle cx="716.4" cy="630" r="74" fill="#fff" />
      <circle cx="307.6" cy="630" r="74" fill="#ffb3c9" />
    </svg>
  );
}
