"use client";

import { useCallback, useEffect, useState } from "react";

import {
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/app/(app)/notifications/actions";

type Status = "loading" | "unsupported" | "off" | "on" | "blocked";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("off");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    if (!VAPID) {
      setMsg("Push isn't configured on the server yet (missing VAPID key).");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID),
      });
      await savePushSubscription(sub.toJSON(), navigator.userAgent);
      setStatus("on");
      setMsg("Notifications enabled on this device.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
      setMsg("Notifications turned off on this device.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendTestPush();
      setMsg(
        r.sent > 0
          ? `Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}. Check your notifications.`
          : "No devices received it — try turning notifications off and on again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const on = status === "on";
  const dotColor =
    status === "on" ? "var(--color-ok)" : status === "loading" ? "var(--color-text-dim)" : "var(--color-danger)";

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Push notifications</span>
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: dotColor }} />
          {status === "loading"
            ? "…"
            : status === "on"
              ? "On"
              : status === "unsupported"
                ? "N/A"
                : status === "blocked"
                  ? "Blocked"
                  : "Off"}
        </span>
      </div>

      <p className="mt-2 text-xs text-[var(--color-text-dim)]">
        {status === "unsupported" &&
          "This browser can't do push here. On iPhone you must add Life Hub to the Home Screen first (see below), then open it from there."}
        {status === "blocked" &&
          "Notifications are blocked in your browser/OS settings for this site. Allow them there, then reload."}
        {status === "off" && "Get a heads-up on this device when something is due."}
        {status === "on" && "This device is set up. You can send yourself a test below."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(status === "off" || status === "unsupported") && (
          <button onClick={enable} disabled={busy || status === "unsupported"} className="btn btn-primary">
            {busy ? "…" : "Enable on this device"}
          </button>
        )}
        {on && (
          <>
            <button onClick={test} disabled={busy} className="btn">
              Send test
            </button>
            <button onClick={disable} disabled={busy} className="btn text-[var(--color-danger)]">
              Turn off
            </button>
          </>
        )}
      </div>

      {msg && <p className="mt-2 text-xs text-[var(--color-text-dim)]">{msg}</p>}
    </div>
  );
}
