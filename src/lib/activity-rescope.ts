import type { Visibility } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { ActivityEntity } from "@/lib/activity";

/** Verbs whose summary is the item's own title (not a trip item's). */
const TITLE_VERBS = [
  "TASK_ADDED",
  "TASK_DONE",
  "TASK_ASSIGNED",
  "EVENT_ADDED",
  "DEADLINE_ADDED",
  "DEADLINE_DONE",
  "TRIP_ADDED",
] as const;

/**
 * A feed line copies its item's visibility and title when it's written. When
 * the item is later made PRIVATE or renamed, its lines must follow, or a
 * hub-mate keeps reading "Lucky added « Cadeau pour Chantelle »" for 90 days.
 *
 * Runs on the trusted client on purpose: app_user may only UPDATE
 * `thankedById`, and other members' lines on the same item (their "done")
 * have to move too. Only ever narrows: going back to SHARED leaves lines
 * written while it was private, private. Best-effort, like logging itself.
 */
export async function rescopeActivity(
  hubId: string,
  entityType: ActivityEntity,
  entityId: string,
  change: { visibility: Visibility; title: string },
): Promise<void> {
  try {
    if (change.visibility === "PRIVATE") {
      await prisma.activity.updateMany({
        where: { hubId, entityType, entityId, visibility: "SHARED" },
        data: { visibility: "PRIVATE" },
      });
    }
    await prisma.activity.updateMany({
      where: {
        hubId,
        entityType,
        entityId,
        verb: { in: [...TITLE_VERBS] },
        NOT: { summary: change.title.trim().slice(0, 200) },
      },
      data: { summary: change.title.trim().slice(0, 200) },
    });
  } catch (err) {
    console.error("[activity] rescope failed", err);
  }
}
