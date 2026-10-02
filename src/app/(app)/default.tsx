/**
 * The main slot's fallback for an intercepted route.
 *
 * The edit sheet's routes (`@modal/(.)tasks/[id]` and friends) only fill the
 * @modal slot. On the soft navigation that opens a sheet, the router keeps
 * whatever list is already in the main slot, so this is not what people see.
 * It exists because the route tree needs *something* here (without it an
 * intercepted route has no main slot at all and resolves to a 404), and it
 * is only ever shown if a sheet is opened from somewhere with no page to keep
 * underneath.
 *
 * Deliberately inert. The server sends this component with every intercepted
 * navigation, so anything it did on mount (an earlier version reloaded the
 * page) would be one router change away from firing on ordinary in-app taps.
 * An empty page behind a working sheet is the worst case, and closing the
 * sheet goes back to where the person was.
 */
export default function Default() {
  return null;
}
