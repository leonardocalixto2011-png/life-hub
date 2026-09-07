/**
 * Shared between the client toggle and the root layout's blocking script, so
 * the storage key can't drift between the thing that writes it and the thing
 * that reads it.
 */
export const REDUCE_MOTION_KEY = "lh-reduce-motion";

/**
 * Applies the stored "reduce motion" preference before the first paint.
 *
 * Runs as a blocking inline script in <head> rather than in an effect: an
 * effect runs after the first frame, and that frame is exactly the one
 * somebody with vestibular sensitivity asked not to see. It only ever adds a
 * class, so there is no flash of the wrong state either way.
 *
 * The Content-Security-Policy allows 'unsafe-inline' for scripts (see
 * next.config.ts for why), so this needs no nonce.
 */
export const MOTION_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(
  REDUCE_MOTION_KEY,
)})==="1")document.documentElement.classList.add("calm")}catch(e){}`;
