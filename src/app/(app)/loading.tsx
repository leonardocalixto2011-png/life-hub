/**
 * Shown the instant a navigation starts, until the server route resolves.
 *
 * Without a loading boundary the App Router keeps the *previous* page on
 * screen and does nothing visible while the server renders — measured at
 * 100–200ms locally and higher in production, where every query is a network
 * round trip to Neon. That gap is what reads as lag: the tap appears to do
 * nothing, so people tap again.
 *
 * Deliberately a skeleton in the same shape as a typical page rather than a
 * spinner. It gives the eye somewhere to land and avoids the layout jolt of
 * empty → spinner → content.
 */
function Bar({ w, h = "h-4" }: { w: string; h?: string }) {
  return (
    // `.sk` carries the accent-tinted sweep from globals.css — the same one
    // everywhere something is loading, and it stops under reduced motion.
    // Decorative: a screen reader should hear the "Loading" status below, not
    // a dozen anonymous boxes.
    <div className={`sk ${h} ${w}`} aria-hidden />
  );
}

export default function Loading() {
  return (
    <div className="space-y-4 p-3">
      <span className="sr-only" role="status" aria-live="polite">
        Loading
      </span>

      <Bar w="w-32" h="h-6" />

      <div className="card space-y-3 p-3">
        <Bar w="w-2/3" />
        <Bar w="w-1/2" h="h-3" />
      </div>

      <div className="card divide-y divide-[var(--color-border)] p-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-3">
            <div className="sk mt-0.5 h-5 w-5 shrink-0 rounded-full" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar w={i === 1 ? "w-1/2" : "w-3/4"} />
              <Bar w="w-1/3" h="h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
