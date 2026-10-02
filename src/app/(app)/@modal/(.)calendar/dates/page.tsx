/**
 * /calendar/dates is a list page, not an event: nothing for the edit sheet to
 * show. The page itself is rendered in the main slot by
 * `(app)/(.)calendar/dates`; this fills the same path in the @modal slot so
 * the slot has a real (empty) page there rather than a fallback.
 */
export default function NoSheet() {
  return null;
}
