"use server";

import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { getLang } from "@/lib/i18n-server";
import { rateLimit } from "@/lib/rate-limit";
import { requireHub } from "@/lib/session";
import { MAX_QUERY, recentItems, searchHub, type SearchGroup, type SearchHit } from "@/lib/search";

export type SearchResponse = {
  groups: SearchGroup[];
  /** Too many searches in a minute; the sheet says so instead of going blank. */
  limited?: boolean;
};

/** Typing a word is ~5 debounced calls; this is a few dozen searches a minute. */
const PER_MINUTE = 150;

async function scope() {
  const [{ user, hub }, lang] = await Promise.all([requireHub(), getLang()]);
  return { hubId: hub.id, userId: user.id, currency: hub.currency, locale: user.locale ?? undefined, lang };
}

/** Search-as-you-type for the header's search sheet. Current hub only. */
export async function searchEverything(query: string): Promise<SearchResponse> {
  const q = z.string().max(MAX_QUERY).safeParse(query);
  if (!q.success || q.data.trim() === "") return { groups: [] };
  const s = await scope();
  const gate = await rateLimit(`search:${s.userId}`, PER_MINUTE, 60);
  if (!gate.ok) return { groups: [], limited: true };
  return { groups: await withHub(s.userId, (tx) => searchHub(tx, s, q.data)) };
}

/** What the sheet shows before anything is typed. */
export async function searchRecent(): Promise<SearchHit[]> {
  const s = await scope();
  return withHub(s.userId, (tx) => recentItems(tx, s));
}
