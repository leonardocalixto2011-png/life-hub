/**
 * One colour per person, fixed by their position in the hub's member list
 * (join order), so a person keeps their colour on every page and a filter
 * never repaints anyone. Past three people the rest share the neutral
 * "other" swatch — a fourth categorical hue fails the colour-blind checks
 * next to the first three (see viz.css).
 */
const SLOTS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)"];

export function personColor(index: number): string {
  return index >= 0 && index < SLOTS.length ? SLOTS[index] : "var(--viz-other)";
}

export type Person = { id: string; name: string; color: string };

export function peopleOf(members: { id: string; name: string | null; email: string | null }[]): Person[] {
  return members.map((m, i) => ({
    id: m.id,
    name: (m.name ?? m.email ?? "?").split(/[\s@]/)[0],
    color: personColor(i),
  }));
}
