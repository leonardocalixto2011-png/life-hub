import { NextResponse, type NextRequest } from "next/server";

/**
 * Fallback for the manifest's POST share target. Normally public/sw.js
 * answers this request itself and it never reaches the server; this only runs
 * when no service worker is controlling the page yet (first launch after
 * install, or a browser that cleared it). It can't hand a photo to the /share
 * page — there is nowhere to put it without storing it — so it keeps the text
 * fields and tells the page a file was dropped (`nofile=1`).
 *
 * Reads nothing and writes nothing: the redirect lands on /share, which does
 * its own requireHub. The auth proxy already gates this path.
 */
export async function POST(request: NextRequest) {
  const target = new URL("/share", request.nextUrl.origin);
  try {
    const form = await request.formData();
    for (const key of ["title", "text", "url"]) {
      const v = form.get(key);
      if (typeof v === "string" && v.trim()) target.searchParams.set(key, v.trim().slice(0, 2000));
    }
    if (form.getAll("files").some((f) => typeof f !== "string" && f.size > 0)) {
      target.searchParams.set("nofile", "1");
    }
  } catch {
    target.searchParams.set("shareError", "1");
  }
  // 303: the browser follows with a GET, which is what a page can answer.
  return NextResponse.redirect(target, 303);
}

/** Someone opened the URL directly. */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/share", request.nextUrl.origin), 303);
}
