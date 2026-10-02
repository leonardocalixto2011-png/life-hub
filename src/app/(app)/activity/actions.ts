"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { activityScope, THANKS_PER_DAY } from "@/lib/activity";
import { withHub } from "@/lib/hub-context";
import { assertActiveMember } from "@/lib/membership";
import { notifyThanks } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { requireHub } from "@/lib/session";

export type ThankResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * "Merci 🙏" on someone else's feed line: records it once per person and sends
 * the person who did the thing one push.
 *
 * Deliberately small. No counter to grow, no streak, nothing shown to the
 * person who *didn't* get thanked — it is a way to say thanks, not a score.
 * Capped per day so it can't be turned into a way to buzz someone's phone.
 */
export async function thankActivity(id: string): Promise<ThankResult> {
  const { user, hub } = await requireHub();
  const parsed = z.string().cuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Not found." };

  const row = await withHub(user.id, (tx) =>
    tx.activity.findFirst({
      // Same hub + privacy clause as the feed itself: a line you can't see is
      // a line you can't thank.
      where: { id: parsed.data, ...activityScope(hub.id, user.id) },
      select: { id: true, actorId: true, summary: true, thankedById: true, visibility: true },
    }),
  );
  if (!row) return { ok: false, error: "Not found." };
  if (row.actorId === user.id) return { ok: false, error: "That one is yours." };
  // Already said: not an error, and not a second push.
  if (row.thankedById.includes(user.id)) return { ok: true, count: row.thankedById.length };

  if (!(await rateLimit(`thanks:${user.id}`, THANKS_PER_DAY, 86_400)).ok) {
    return { ok: false, error: "That's plenty of thanks for today — more tomorrow." };
  }

  // One statement, so two taps (or two devices) can't both add the name: only
  // the update that actually appends gets to send the push. Raw because the
  // app role may UPDATE this one column and nothing else on the table.
  const appended = await withHub(
    user.id,
    (tx) => tx.$executeRaw`
      UPDATE "Activity"
         SET "thankedById" = array_append("thankedById", ${user.id})
       WHERE "id" = ${row.id}
         AND "hubId" = ${hub.id}
         AND "visibility" = 'SHARED'
         AND "actorId" <> ${user.id}
         AND NOT (${user.id} = ANY("thankedById"))`,
  );
  if (appended !== 1) return { ok: true, count: row.thankedById.length };

  // Only to someone still in the hub; a failed push never fails the thanks.
  try {
    await assertActiveMember(hub.id, row.actorId);
    await notifyThanks(row.id, row.summary, row.actorId, user.name);
  } catch {
    // They left, or push is unavailable — the 🙏 on the line still stands.
  }

  revalidatePath("/today");
  revalidatePath("/activity");
  return { ok: true, count: row.thankedById.length + 1 };
}
