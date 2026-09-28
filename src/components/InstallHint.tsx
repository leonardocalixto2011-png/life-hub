"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";

import { useT } from "@/components/I18nProvider";

// Device facts never change while the page is open, so there is nothing to
// subscribe to — useSyncExternalStore is here for its server snapshot. The
// server (and hydration) report "standalone", which renders the short
// one-liner; a browser tab then swaps in the install steps with no mismatch.
const noop = () => () => {};

function readDevice(): string {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return `${ios ? "ios" : "other"}:${standalone ? "app" : "tab"}`;
}

/** Fills `{name}` slots in a translated sentence with JSX (bold words). */
function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/\{(\w+)\}/g).map((seg, i) =>
    i % 2 === 1 ? <Fragment key={i}>{parts[seg] ?? seg}</Fragment> : seg,
  );
}

export function InstallHint() {
  const t = useT();
  const device = useSyncExternalStore(noop, readDevice, () => "other:app");
  const isIOS = device.startsWith("ios");
  const standalone = device.endsWith(":app");

  if (standalone) {
    return (
      <div className="card p-4 text-xs text-[var(--color-text-dim)]">
        {t("✓ Running as an installed app — push notifications can work here.")}
      </div>
    );
  }

  const b = (s: string) => <strong>{t(s)}</strong>;

  return (
    <div className="card p-4">
      <p className="text-sm font-semibold">{t("Add Life Hub to your Home Screen")}</p>
      <p className="mt-1 text-xs text-[var(--color-text-dim)]">
        {isIOS
          ? t("On iPhone, notifications only work after the app is installed. It takes ~15 seconds:")
          : t("Install the app for a full-screen experience and reliable notifications:")}
      </p>

      {isIOS ? (
        <ol className="mt-2 space-y-1.5 pl-5 text-sm" style={{ listStyle: "decimal" }}>
          <li>{rich(t("Open this page in {safari} (not Chrome or an in-app browser)."), { safari: <strong>Safari</strong> })}</li>
          <li>
            {rich(t("Tap the {share} button in the bottom bar."), { share: b("Share") })}
            <span aria-hidden> ⎋</span>
          </li>
          <li>
            {rich(t("Scroll down and tap {add}."), { add: b("Add to Home Screen") })}
            <span aria-hidden> ➕</span>
          </li>
          <li>{rich(t("Tap {add}, then open Life Hub from its new Home Screen icon."), { add: b("Add") })}</li>
          <li>{t("Come back to this page and tap “Enable on this device”.")}</li>
        </ol>
      ) : (
        <ol className="mt-2 space-y-1.5 pl-5 text-sm" style={{ listStyle: "decimal" }}>
          <li>{t("Open your browser menu (⋮ or the install icon in the address bar).")}</li>
          <li>
            {rich(t("Choose {install} / {add}."), { install: b("Install app"), add: b("Add to Home Screen") })}
          </li>
          <li>{t("Open Life Hub from the installed icon, then enable notifications.")}</li>
        </ol>
      )}

      <p className="mt-2 text-xs text-[var(--color-text-dim)]">
        {t("Requires iOS 16.4 or later. This is a one-time step per person and per device.")}
      </p>
    </div>
  );
}
