"use client";

import { useEffect, useState } from "react";

export function InstallHint() {
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !("MSStream" in window));
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari
        (navigator as unknown as { standalone?: boolean }).standalone === true,
    );
  }, []);

  if (standalone) {
    return (
      <div className="card p-4 text-xs text-[var(--color-text-dim)]">
        ✓ Running as an installed app — push notifications can work here.
      </div>
    );
  }

  return (
    <div className="card p-4">
      <p className="text-sm font-semibold">Add Life Hub to your Home Screen</p>
      <p className="mt-1 text-xs text-[var(--color-text-dim)]">
        {isIOS
          ? "On iPhone, notifications only work after the app is installed. It takes ~15 seconds:"
          : "Install the app for a full-screen experience and reliable notifications:"}
      </p>

      {isIOS ? (
        <ol className="mt-2 space-y-1.5 pl-5 text-sm" style={{ listStyle: "decimal" }}>
          <li>
            Open this page in <strong>Safari</strong> (not Chrome or an in-app browser).
          </li>
          <li>
            Tap the <strong>Share</strong> button
            <span aria-hidden> ⎋ </span>
            in the bottom bar.
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>
            <span aria-hidden> ➕</span>.
          </li>
          <li>
            Tap <strong>Add</strong>, then open Life Hub from its new Home Screen icon.
          </li>
          <li>Come back to this page and tap “Enable on this device”.</li>
        </ol>
      ) : (
        <ol className="mt-2 space-y-1.5 pl-5 text-sm" style={{ listStyle: "decimal" }}>
          <li>
            Open your browser menu (⋮ or the install icon in the address bar).
          </li>
          <li>
            Choose <strong>Install app</strong> / <strong>Add to Home Screen</strong>.
          </li>
          <li>Open Life Hub from the installed icon, then enable notifications.</li>
        </ol>
      )}

      <p className="mt-2 text-xs text-[var(--color-text-dim)]">
        Requires iOS 16.4 or later. This is a one-time step per person and per device.
      </p>
    </div>
  );
}
