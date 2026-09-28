import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life Hub",
    short_name: "Life Hub",
    description: "Shared life & business admin — tasks, deadlines, subscriptions, budget.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f6f4",
    theme_color: "#4f46e5",
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    // Long-press the home-screen icon (Android; desktop Chrome/Edge too). Each
    // lands on /today with a flag QuickAdd consumes on arrival and strips from
    // the URL. "Snap" can't open the camera by itself — browsers only open a
    // file picker from a real tap — so it shows a one-tap "Take photo" button.
    // iOS ignores shortcuts entirely; nothing breaks there.
    shortcuts: [
      {
        name: "Add",
        short_name: "Add",
        url: "/today?add=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Speak",
        short_name: "Speak",
        url: "/today?voice=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Snap a receipt",
        short_name: "Snap",
        url: "/today?snap=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
