/**
 * Not a modal: the opposite. `@modal/(.)calendar/[id]` intercepts every soft
 * navigation to /calendar/<anything>, and "dates" is an <anything>. Without
 * this file, tapping "Dates" would open the special-dates URL as an event in
 * the edit sheet. Both interception rewrites resolve /calendar/dates to the
 * same internal path, and there the static segment beats the dynamic one, so
 * this file wins whichever order the rewrites run in, and simply renders the
 * real page in the main slot.
 */
export const dynamic = "force-dynamic";

export { default } from "../../calendar/dates/page";
