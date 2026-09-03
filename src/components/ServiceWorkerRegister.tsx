"use client";

import { useEffect } from "react";

/** Registers the push service worker once, app-wide. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* non-fatal — the /notifications page surfaces real errors */
    });
  }, []);

  return null;
}
