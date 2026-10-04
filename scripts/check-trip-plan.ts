/**
 * Unit checks for src/lib/trip-plan.ts: date shifting, French text, and the
 * "import twice adds nothing" rule across languages. No database.
 *
 *   npx tsx scripts/check-trip-plan.ts
 */
import assert from "node:assert/strict";

import {
  deadlineKeys,
  legacyPlanDeadlines,
  missingPlanRows,
  noon,
  planNote,
  planRows,
  planShiftDays,
  planTripPatch,
  resolvePlan,
  retiredRowIds,
  TRIP_TEMPLATES,
  tripPlanSchema,
  ymd,
  type TripPlan,
} from "../src/lib/trip-plan";
import { checkFrench } from "../src/lib/trip-plans/localise";
import { thailand2027Fr } from "../src/lib/trip-plans/thailand-2027.fr";
import { thailandMediaOrphans } from "../src/lib/trip-plans/thailand-2027";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const plan = TRIP_TEMPLATES["thailand-2027"].plan;
const trip = (start: string, end: string) => ({ startDate: noon(start), endDate: noon(end) });

check("the template, French included, is a valid plan", () => {
  tripPlanSchema.parse(plan);
});

check("every Thailand photo, place and link matches a row", () => {
  assert.deepEqual(thailandMediaOrphans, []);
  assert.ok(plan.trip?.image, "the trip has a cover photo");
  assert.ok(plan.items.filter((i) => i.image).length >= 6);
});

check("every item, stop and reminder has French, and no French key is orphaned", () => {
  assert.deepEqual(checkFrench(plan, thailand2027Fr), []);
});

check("same dates as the plan: nothing moves", () => {
  assert.equal(planShiftDays(plan, trip("2027-03-11", "2027-03-20")), 0);
  const rows = planRows(resolvePlan(plan), "t", "h");
  assert.equal(ymd(rows[0].date!), "2027-03-12");
});

check("template Mar 11–20 into a trip Mar 1–8: everything moves 10 days earlier", () => {
  const by = planShiftDays(plan, trip("2027-03-01", "2027-03-08"));
  assert.equal(by, -10);
  const r = resolvePlan(plan, { shiftDays: by });
  // the stop
  assert.equal(r.stops[0].from, "2027-03-02");
  assert.equal(r.stops[0].to, "2027-03-09");
  // first day's activity lands on the trip's first day
  const first = r.items.find((i) => i.kind === "ACTIVITY")!;
  assert.equal(first.date, "2027-03-01");
  // bookings, deposits and reminders keep their distance from the trip
  assert.equal(r.items.find((i) => i.title.startsWith("Flights YUL"))!.date, "2026-11-20");
  assert.equal(r.items.find((i) => i.title.startsWith("October deposit"))!.date, "2026-09-21");
  assert.equal(r.deadlines!.find((d) => d.title.startsWith("Submit the TDAC"))!.due, "2027-02-27");
  // undated rows stay undated
  assert.equal(r.items.find((i) => i.kind === "PACK")!.date, undefined);
  // every dated row moved by exactly the offset
  for (const [n, i] of plan.items.entries()) {
    if (!i.date) continue;
    const moved = Math.round((noon(r.items[n].date!).getTime() - noon(i.date).getTime()) / 86_400_000);
    assert.equal(moved, -10, i.title);
  }
});

check("a shift across a month end, a year end and a clock change", () => {
  const p: TripPlan = tripPlanSchema.parse({
    trip: { start: "2027-03-11" },
    items: [
      { kind: "ACTIVITY", title: "a", date: "2027-03-11" },
      { kind: "TODO", title: "b", date: "2026-12-28" },
      { kind: "TODO", title: "c", date: "2027-03-14" }, // DST starts Mar 14, 2027
    ],
  });
  const by = planShiftDays(p, trip("2027-03-20", "2027-03-27"));
  assert.equal(by, 9);
  const r = resolvePlan(p, { shiftDays: by });
  assert.deepEqual(r.items.map((i) => i.date), ["2027-03-20", "2027-01-06", "2027-03-23"]);
  // a year later, across a leap day
  assert.equal(planShiftDays(p, trip("2028-03-11", "2028-03-18")), 366);
});

check("a pasted plan with no start of its own only moves when it falls outside the trip", () => {
  const p: TripPlan = tripPlanSchema.parse({
    stops: [{ name: "Lisbon", from: "2027-05-03", to: "2027-05-06" }],
    items: [{ kind: "ACTIVITY", title: "Tram 28", date: "2027-05-04" }],
  });
  // written for this trip (first night is day 2): stays put
  assert.equal(planShiftDays(p, trip("2027-05-02", "2027-05-08")), 0);
  // written for other dates: first stop moves onto the trip's first day
  assert.equal(planShiftDays(p, trip("2027-06-10", "2027-06-16")), 38);
  // nothing dated at all
  assert.equal(planShiftDays(tripPlanSchema.parse({ items: [{ kind: "PACK", title: "Hat" }] }), trip("2027-06-10", "2027-06-16")), 0);
});

check("a trip still on an earlier version's dates follows the plan instead of shifting it", () => {
  const old = {
    title: "Thailand + Vietnam",
    destination: "Bangkok · Krabi · Hoi An",
    startDate: noon("2027-03-11"),
    endDate: noon("2027-03-22"),
    budgetCents: 630000,
    notes: null,
  };
  const patch = planTripPatch(resolvePlan(plan), old);
  assert.equal(ymd(patch.endDate!), "2027-03-20");
  assert.equal(planShiftDays(plan, { startDate: patch.startDate ?? old.startDate, endDate: patch.endDate ?? old.endDate }), 0);
});

check("French import writes French titles and notes", () => {
  const r = resolvePlan(plan, { lang: "fr" });
  const rows = planRows(r, "t", "h");
  assert.ok(rows.some((x) => x.title === "Arrivée à Montréal"));
  assert.ok(!rows.some((x) => x.title === "Land in Montréal"));
  assert.equal(r.trip!.title, "Thaïlande, une semaine");
  assert.ok(r.deadlines!.every((d) => d.alt && d.title !== d.alt));
  const tip = rows.find((x) => x.title === "La météo")!;
  assert.ok("note" in tip && tip.note?.startsWith("Saison sèche"));
});

check("importing again adds nothing — same language, or the other one", () => {
  const en = resolvePlan(plan);
  const fr = resolvePlan(plan, { lang: "fr" });
  const enRows = planRows(en, "t", "h");
  const frRows = planRows(fr, "t", "h");
  assert.equal(enRows.length, frRows.length);
  assert.equal(missingPlanRows(en, "t", "h", enRows).length, 0);
  assert.equal(missingPlanRows(fr, "t", "h", frRows).length, 0);
  assert.equal(missingPlanRows(fr, "t", "h", enRows).length, 0, "French import onto English rows");
  assert.equal(missingPlanRows(en, "t", "h", frRows).length, 0, "English import onto French rows");
  // and a shifted import onto unshifted rows: still matched on title alone
  assert.equal(missingPlanRows(resolvePlan(plan, { lang: "fr", shiftDays: -10 }), "t", "h", enRows).length, 0);
  // one row missing is the one row added
  const one = missingPlanRows(fr, "t", "h", enRows.filter((x) => x.title !== "Land in Montréal"));
  assert.deepEqual(one.map((x) => x.title), ["Arrivée à Montréal"]);
});

check("a note is filled in the language of the row it belongs to", () => {
  const fr = resolvePlan(plan, { lang: "fr" });
  assert.ok(planNote(fr, "TIP", "The weather")?.startsWith("Dry season"));
  assert.ok(planNote(fr, "TIP", "La météo")?.startsWith("Saison sèche"));
  assert.equal(planNote(fr, "TIP", "Something else"), null);
});

check("the current plan's rows are never retired, in either language", () => {
  for (const lang of ["en", "fr"] as const) {
    const r = resolvePlan(plan, { lang });
    const existing = planRows(r, "t", "h").map((x, n) => ({ id: String(n), kind: x.kind, title: x.title, done: false }));
    assert.deepEqual(retiredRowIds(r, existing), []);
  }
  const r = resolvePlan(plan);
  assert.deepEqual(
    retiredRowIds(r, [
      { id: "a", kind: "STOP", title: "Bangkok", done: false },
      { id: "b", kind: "STOP", title: "Hoi An, Vietnam", done: true },
    ]),
    ["a"],
  );
});

check("a reminder is found under either title, on the moved day or the plan's own", () => {
  const r = resolvePlan(plan, { lang: "fr", shiftDays: -10 });
  const d = r.deadlines!.find((x) => x.alt === "Submit the TDAC arrival cards")!;
  assert.deepEqual(deadlineKeys(d), [
    "remplir les cartes d'arrivée tdac|2027-02-27",
    "submit the tdac arrival cards|2027-02-27",
    "remplir les cartes d'arrivée tdac|2027-03-09",
    "submit the tdac arrival cards|2027-03-09",
  ]);
  // unshifted English: exactly the one key it always had
  const plain = resolvePlan(plan).deadlines!.find((x) => x.title === "Submit the TDAC arrival cards")!;
  assert.deepEqual(deadlineKeys(plain).slice(0, 1), ["submit the tdac arrival cards|2027-03-09"]);
});

check("legacy reminders are only claimed by a trip that is recognisably the template", () => {
  const byTitle = legacyPlanDeadlines({ title: "Thailand + Vietnam", items: [] });
  assert.ok(byTitle?.keys.has("book the thailand flights (last good date)|2026-11-30"));
  assert.ok(byTitle?.keys.has("apply for the vietnam e-visas|2027-02-10"), "earlier versions' reminders too");
  const byRows = legacyPlanDeadlines({
    title: "Notre voyage",
    items: planRows(resolvePlan(plan), "t", "h").slice(0, 6).map((x) => ({ kind: x.kind, title: x.title })),
  });
  assert.ok(byRows);
  assert.equal(legacyPlanDeadlines({ title: "Weekend in Québec", items: [{ kind: "PACK", title: "Hat" }] }), null);
});

console.log(`\n${passed} checks passed`);
