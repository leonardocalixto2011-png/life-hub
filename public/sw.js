/* Life Hub service worker — push notifications and the share-sheet receiver.
 * No offline caching: the only cache here is a hand-off for shared photos.
 *
 * Bump SW_VERSION on every change. /sw.js is served no-cache (next.config.ts),
 * so the browser byte-compares it on each navigation; the version line
 * guarantees the bytes differ, and skipWaiting + clients.claim below make the
 * new worker take over immediately instead of after every tab closes.
 */
const SW_VERSION = "2026-10-04.1-nav-preload";

/** Shared photos wait here between the POST and the /share page reading them. */
const SHARE_CACHE = "lifehub-share-v1";
/** Same as the page's limit: each photo is one paid Claude call. */
const SHARE_MAX_IMAGES = 3;

// Lets a page (or DevTools) ask which worker is live: postMessage("version").
self.addEventListener("message", (event) => {
  if (event.data === "version" && event.source) event.source.postMessage({ swVersion: SW_VERSION });
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Having a fetch listener at all means every navigation waits for this
      // worker to boot before the request goes out. Navigation preload starts
      // the network request in parallel with the boot; the handler below
      // hands the page that already-running response.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      // Drop any share cache from an older worker version.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("lifehub-share-") && n !== SHARE_CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// ---- share target -----------------------------------------------------------
// manifest.ts declares a POST multipart share_target at /share/receive. A page
// can't be the target of a POST, so the worker takes the request, stores the
// images, and answers with a 303 to the /share page, which reads them back.
// GET navigations are answered from the navigation preload; every other
// request is left alone (no respondWith → normal network).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode === "navigate" && req.method === "GET") {
    // Use the preloaded response (see activate); plain network otherwise.
    event.respondWith(
      (async () => (await event.preloadResponse) || fetch(req))(),
    );
    return;
  }
  if (req.method !== "POST") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname !== "/share/receive") return;
  event.respondWith(receiveShare(req));
});

async function receiveShare(request) {
  const target = new URL("/share", self.location.origin);
  try {
    const form = await request.formData();
    for (const key of ["title", "text", "url"]) {
      const v = form.get(key);
      if (typeof v === "string" && v.trim()) target.searchParams.set(key, v.trim().slice(0, 2000));
    }

    const files = form.getAll("files").filter((f) => typeof f !== "string" && f && f.size > 0);
    const images = files.filter((f) => (f.type || "").startsWith("image/"));
    const kept = images.slice(0, SHARE_MAX_IMAGES);

    // One share at a time: whatever an earlier share left behind goes first.
    await caches.delete(SHARE_CACHE);
    if (kept.length) {
      const cache = await caches.open(SHARE_CACHE);
      await Promise.all(
        kept.map((file, i) =>
          cache.put(
            new Request(`/__share/${i}`),
            new Response(file, {
              headers: { "Content-Type": file.type, "X-Shared-At": String(Date.now()) },
            }),
          ),
        ),
      );
      target.searchParams.set("shared", "1");
    }
    if (images.length > kept.length) target.searchParams.set("more", String(images.length - kept.length));
    if (files.length > images.length) target.searchParams.set("skipped", String(files.length - images.length));
  } catch {
    target.searchParams.set("shareError", "1");
  }
  return Response.redirect(target.href, 303);
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Life Hub", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Life Hub";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "life-hub",
    renotify: Boolean(data.tag),
    data: { url: data.url || "/today", taskId: data.taskId || null },
    vibrate: [80, 40, 80],
  };

  // Buttons where the platform has them (Android, desktop). iOS has no
  // `actions` at all — maxActions is undefined there — and simply gets the
  // same notification without them. Never more than the platform will show.
  const max = typeof Notification !== "undefined" && Notification.maxActions ? Notification.maxActions : 0;
  if (max > 0 && Array.isArray(data.actions) && data.actions.length) {
    options.actions = data.actions
      .filter((a) => a && typeof a.action === "string" && typeof a.title === "string")
      .slice(0, max)
      .map((a) => ({ action: a.action, title: a.title }));
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

/** Bring the app to `target`: reuse an open window if there is one. */
async function openApp(target) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if ("focus" in client) {
      client.navigate(target).catch(() => {});
      return client.focus();
    }
  }
  return self.clients.openWindow(target);
}

/**
 * "Done" / "Tomorrow" pressed on a task notification: do it without opening
 * the app. The session cookie authenticates the request (same origin), so the
 * push itself carries no secret. Anything other than a clean success — signed
 * out, offline, task gone — opens the task instead, so the press is never
 * silently lost.
 */
async function taskAction(action, taskId, fallbackUrl) {
  try {
    const res = await fetch("/api/push/action", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, action }),
    });
    if (!res.ok) return openApp(fallbackUrl);
    // Any open window is now showing a stale list; ask it to refresh.
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "lh:refresh" });
  } catch {
    return openApp(fallbackUrl);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || "/today";

  if ((event.action === "done" || event.action === "tomorrow") && data.taskId) {
    event.waitUntil(taskAction(event.action, data.taskId, target));
    return;
  }
  // The body, or the "view" button: both just open the thing.
  event.waitUntil(openApp(target));
});
