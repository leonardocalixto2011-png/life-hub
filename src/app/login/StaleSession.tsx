"use client";

import { useEffect } from "react";

import { clearStaleSession } from "./actions";

/**
 * Rendered only when the browser holds a session cookie for an account that
 * no longer exists. Clears the cookie in the background, so the proxy stops
 * treating this browser as signed in. Renders nothing.
 */
export function StaleSession() {
  useEffect(() => {
    void clearStaleSession().catch(() => {});
  }, []);
  return null;
}
