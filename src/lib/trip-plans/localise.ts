import type { TripPlan } from "../trip-plan";

/**
 * A plan's French text, kept in a file of its own and keyed by the English
 * it translates: `KIND|title` for items, the name for stops, the title for
 * reminders. `withFrench` folds it into the plan as the optional `fr` fields
 * the importer reads.
 *
 * Type-only import above on purpose: trip-plan.ts imports the templates, so a
 * runtime import back into it would be a cycle. And no "@/" alias — the seed
 * script loads these files through tsx.
 */
export type PlanFrench = {
  /** The template's name in the import picker. */
  label?: string;
  trip?: { title?: string; destination?: string; notes?: string };
  stops?: Record<string, string>;
  items?: Record<string, { title: string; note?: string }>;
  deadlines?: Record<string, { title: string; notes?: string }>;
};

const itemKey = (kind: string, title: string) => `${kind}|${title}`;

/** The plan with its French attached. English stays the plan's identity. */
export function withFrench(plan: TripPlan, fr: PlanFrench): TripPlan {
  return {
    ...plan,
    trip: plan.trip ? { ...plan.trip, ...(fr.trip ? { fr: fr.trip } : {}) } : plan.trip,
    stops: plan.stops.map((s) => (fr.stops?.[s.name] ? { ...s, fr: { name: fr.stops[s.name] } } : s)),
    items: plan.items.map((i) => {
      const f = fr.items?.[itemKey(i.kind, i.title)];
      return f ? { ...i, fr: f } : i;
    }),
    deadlines: plan.deadlines?.map((d) => {
      const f = fr.deadlines?.[d.title];
      return f ? { ...d, fr: f } : d;
    }),
  };
}

/**
 * What's wrong between a plan and its French, as readable lines; empty when
 * they line up. Catches the two ways they drift: an English title edited
 * without its key here (the translation silently stops applying), and an item
 * with a note in English but none in French (half-translated on screen).
 */
export function checkFrench(plan: TripPlan, fr: PlanFrench): string[] {
  const problems: string[] = [];
  const itemKeys = new Set(plan.items.map((i) => itemKey(i.kind, i.title)));
  const stopNames = new Set(plan.stops.map((s) => s.name));
  const deadlineTitles = new Set((plan.deadlines ?? []).map((d) => d.title));

  for (const k of Object.keys(fr.items ?? {})) if (!itemKeys.has(k)) problems.push(`French item matches nothing: ${k}`);
  for (const k of Object.keys(fr.stops ?? {})) if (!stopNames.has(k)) problems.push(`French stop matches nothing: ${k}`);
  for (const k of Object.keys(fr.deadlines ?? {})) {
    if (!deadlineTitles.has(k)) problems.push(`French reminder matches nothing: ${k}`);
  }

  for (const i of plan.items) {
    const f = fr.items?.[itemKey(i.kind, i.title)];
    if (!f) problems.push(`No French for item: ${itemKey(i.kind, i.title)}`);
    else if (i.note && !f.note) problems.push(`No French note for item: ${itemKey(i.kind, i.title)}`);
  }
  for (const s of plan.stops) if (!fr.stops?.[s.name]) problems.push(`No French for stop: ${s.name}`);
  for (const d of plan.deadlines ?? []) {
    const f = fr.deadlines?.[d.title];
    if (!f) problems.push(`No French for reminder: ${d.title}`);
    else if (d.notes && !f.notes) problems.push(`No French notes for reminder: ${d.title}`);
  }
  if (plan.trip?.title && !fr.trip?.title) problems.push("No French trip title");
  if (plan.trip?.notes && !fr.trip?.notes) problems.push("No French trip notes");
  return problems;
}
