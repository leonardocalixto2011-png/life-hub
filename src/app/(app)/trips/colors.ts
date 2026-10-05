/** Stop colours, in itinerary order. Travel days (no stop) are neutral.
 *  Shared by the trip page's day strip and the postcard on /trips, so a trip
 *  wears the same colours in both places. */
export const STOP_COLORS = ["#D9821A", "#0E7C7B", "#C0392B", "#6D4FB3", "#2F7D4F", "#2563EB"];

/**
 * The background a trip shows when it has no cover photo: its stops' colours
 * in order, or — for a trip with no stops yet — two neighbouring colours
 * picked from the title, so each trip still looks like itself and keeps that
 * look between visits.
 */
export function tripGradient(title: string, stopCount: number): string {
  if (stopCount > 1) {
    const colors = Array.from({ length: stopCount }, (_, n) => STOP_COLORS[n % STOP_COLORS.length]);
    return `linear-gradient(120deg, ${colors.join(", ")})`;
  }
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = STOP_COLORS[h % STOP_COLORS.length];
  const b = STOP_COLORS[(h + 1) % STOP_COLORS.length];
  return stopCount === 1 ? a : `linear-gradient(120deg, ${a}, ${b})`;
}
