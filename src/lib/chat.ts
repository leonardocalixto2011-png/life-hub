import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { withHub, type HubTx } from "@/lib/hub-context";
import { rateLimit } from "@/lib/rate-limit";
import { sendPushToUser } from "@/lib/push";
import { langOf, translate } from "@/lib/i18n";
import { personName } from "@/lib/people";

/**
 * Chats: the AI assistant, one-to-one, groups, and one chat per hub.
 *
 * Who can talk to whom is the same boundary as "add a known person" on the
 * members page: people who already share an ACTIVE hub with you. There is no
 * directory of users and no way to message a stranger — the app never tells
 * anyone who else has an account.
 *
 * Creating a conversation (which seats other people) runs on the trusted
 * client after that check, because the app role may only ever seat itself;
 * reading and writing messages runs under withHub, where the chat RLS
 * policies (migration *_credits_and_chats) decide what is visible. The app
 * filters below mirror those policies, per this project's rule.
 */

export const MAX_MESSAGE = 4000;
export const MAX_GROUP = 30;

export type Contact = { id: string; name: string | null; username: string | null; avatarUrl: string | null };

/** People who share at least one ACTIVE hub with `userId`, never including them. */
export async function contactsFor(userId: string): Promise<Contact[]> {
  const mine = await prisma.hubMembership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { hubId: true },
  });
  if (mine.length === 0) return [];
  const rows = await prisma.hubMembership.findMany({
    where: { hubId: { in: mine.map((m) => m.hubId) }, status: "ACTIVE", userId: { not: userId } },
    select: { user: { select: { id: true, name: true, username: true, avatarUrl: true } } },
  });
  const seen = new Map<string, Contact>();
  for (const r of rows) seen.set(r.user.id, r.user);
  return [...seen.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

async function assertContacts(userId: string, others: string[]) {
  const ok = new Set((await contactsFor(userId)).map((c) => c.id));
  for (const id of others) {
    if (!ok.has(id)) throw new Error("You can only message people you share a hub with.");
  }
}

/** The one chat between two people, created on first use. */
export async function openDirect(userId: string, otherId: string): Promise<string> {
  if (otherId === userId) throw new Error("You can only message people you share a hub with.");
  await assertContacts(userId, [otherId]);
  const uniqueKey = [userId, otherId].sort().join(":");
  const existing = await prisma.conversation.findUnique({ where: { uniqueKey }, select: { id: true } });
  if (existing) {
    // Re-seat whoever left, so "message Dan" always lands in a chat both can read.
    await prisma.conversationMember.createMany({
      data: [userId, otherId].map((u) => ({ conversationId: existing.id, userId: u })),
      skipDuplicates: true,
    });
    return existing.id;
  }
  try {
    const c = await prisma.conversation.create({
      data: {
        kind: "DIRECT",
        uniqueKey,
        createdById: userId,
        members: { create: [{ userId }, { userId: otherId }] },
      },
      select: { id: true },
    });
    return c.id;
  } catch {
    // Both opened it at the same moment.
    return (await prisma.conversation.findUniqueOrThrow({ where: { uniqueKey }, select: { id: true } })).id;
  }
}

export async function createGroup(userId: string, title: string, memberIds: string[]): Promise<string> {
  const others = [...new Set(memberIds)].filter((id) => id !== userId);
  const name = title.trim().slice(0, 80);
  if (!name) throw new Error("Give the group a name.");
  if (others.length === 0) throw new Error("Pick at least one person.");
  if (others.length + 1 > MAX_GROUP) throw new Error("A group can have up to 30 people.");
  await assertContacts(userId, others);
  if (!(await rateLimit(`chat-group:${userId}`, 20, 86400)).ok) {
    throw new Error("You've created a lot of groups today. Try again tomorrow.");
  }
  const c = await prisma.conversation.create({
    data: {
      kind: "GROUP",
      title: name,
      createdById: userId,
      members: { create: [userId, ...others].map((u) => ({ userId: u })) },
    },
    select: { id: true },
  });
  return c.id;
}

/** Adds people to a group. Any member may add their own contacts. */
export async function addToGroup(userId: string, conversationId: string, memberIds: string[]) {
  const conv = await withHub(userId, (tx) =>
    tx.conversation.findFirst({
      where: { id: conversationId, kind: "GROUP", members: { some: { userId } } },
      select: { id: true, _count: { select: { members: true } } },
    }),
  );
  if (!conv) throw new Error("Not found.");
  const others = [...new Set(memberIds)].filter((id) => id !== userId);
  if (conv._count.members + others.length > MAX_GROUP) throw new Error("A group can have up to 30 people.");
  await assertContacts(userId, others);
  await prisma.conversationMember.createMany({
    data: others.map((u) => ({ conversationId, userId: u })),
    skipDuplicates: true,
  });
}

/** Every hub has one chat for all its members, made the first time anyone looks. */
export async function ensureHubChats(userId: string): Promise<void> {
  const hubs = await prisma.hubMembership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { hubId: true },
  });
  for (const { hubId } of hubs) {
    await prisma.conversation.upsert({
      where: { uniqueKey: `hub:${hubId}` },
      update: {},
      create: { kind: "HUB", hubId, uniqueKey: `hub:${hubId}`, createdById: null },
      select: { id: true },
    });
  }
}

/** A new conversation with the assistant. */
export async function createAiChat(userId: string, hubId: string | null): Promise<string> {
  const c = await prisma.conversation.create({
    data: { kind: "AI", hubId, createdById: userId, members: { create: [{ userId }] } },
    select: { id: true },
  });
  return c.id;
}

/** App-level mirror of chat_can_see(): a seat, or an ACTIVE membership of a hub chat's hub. */
export function visibleConversations(userId: string): Prisma.ConversationWhereInput {
  return {
    OR: [
      { kind: { not: "HUB" }, members: { some: { userId } } },
      { kind: "HUB", hub: { memberships: { some: { userId, status: "ACTIVE" } } } },
    ],
  };
}

export async function listConversations(userId: string) {
  await ensureHubChats(userId);
  const rows = await withHub(userId, (tx) =>
    tx.conversation.findMany({
      where: visibleConversations(userId),
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        title: true,
        lastMessageAt: true,
        hub: { select: { id: true, name: true, color: true } },
        members: {
          select: {
            userId: true,
            lastReadAt: true,
            mutedAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        messages: {
          where: { hidden: false },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, role: true, authorId: true, createdAt: true },
        },
      },
    }),
  );
  return rows.map((c) => {
    const me = c.members.find((m) => m.userId === userId);
    const last = c.messages[0] ?? null;
    const unread =
      last != null && last.authorId !== userId && last.role === "USER" && (!me?.lastReadAt || me.lastReadAt < last.createdAt);
    return { ...c, last, unread, others: c.members.filter((m) => m.userId !== userId).map((m) => m.user) };
  });
}
export type ConversationRow = Awaited<ReturnType<typeof listConversations>>[number];

/** How a conversation is named in a list or a header. */
export function conversationTitle(
  c: { kind: string; title: string | null; hub?: { name: string } | null; others?: { name: string | null }[] },
  lang: "en" | "fr",
): string {
  if (c.kind === "AI") return c.title || translate(lang, "Assistant");
  if (c.kind === "HUB") return c.hub?.name ?? translate(lang, "Hub chat");
  if (c.kind === "GROUP") return c.title || translate(lang, "Group");
  const other = c.others?.[0];
  return other ? personName(other, translate(lang, "Member")) : translate(lang, "Just you");
}

/** Chats with something new for this person — the header badge. Cheap: one query. */
export async function unreadChatCount(userId: string): Promise<number> {
  const rows = await withHub(userId, (tx) =>
    tx.conversation.findMany({
      where: { ...visibleConversations(userId), kind: { not: "AI" } },
      select: {
        lastMessageAt: true,
        members: { where: { userId }, select: { lastReadAt: true } },
        messages: {
          where: { hidden: false, role: "USER", authorId: { not: userId } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
  );
  return rows.filter((r) => {
    const last = r.messages[0]?.createdAt;
    const read = r.members[0]?.lastReadAt;
    return last && (!read || read < last);
  }).length;
}

export async function getConversation(tx: HubTx, userId: string, id: string) {
  return tx.conversation.findFirst({
    where: { id, ...visibleConversations(userId) },
    select: {
      id: true,
      kind: true,
      title: true,
      hubId: true,
      createdById: true,
      hub: { select: { id: true, name: true, color: true } },
      members: {
        select: {
          userId: true,
          mutedAt: true,
          lastReadAt: true,
          user: { select: { id: true, name: true, username: true, avatarUrl: true } },
        },
      },
    },
  });
}

export function listMessages(tx: HubTx, conversationId: string, opts: { after?: Date; take?: number } = {}) {
  return tx.chatMessage.findMany({
    where: { conversationId, hidden: false, ...(opts.after ? { createdAt: { gt: opts.after } } : {}) },
    orderBy: { createdAt: opts.after ? "asc" : "desc" },
    take: opts.take ?? 80,
    select: {
      id: true,
      authorId: true,
      role: true,
      body: true,
      meta: true,
      createdAt: true,
      editedAt: true,
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
}
export type ChatMessageRow = Awaited<ReturnType<typeof listMessages>>[number];

/** Moves this person's read marker to now. Seats them in a hub chat on first read. */
export async function markRead(userId: string, conversationId: string) {
  await withHub(userId, async (tx) => {
    const c = await tx.conversation.findFirst({
      where: { id: conversationId, ...visibleConversations(userId) },
      select: { id: true },
    });
    if (!c) return;
    await tx.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: { lastReadAt: new Date() },
      create: { conversationId, userId, lastReadAt: new Date() },
    });
  });
}

/**
 * A person's message in a people chat (not the assistant — that goes through
 * lib/assistant). Pushes everyone else who can read it and hasn't muted it.
 */
export async function postMessage(
  user: { id: string; name: string | null },
  conversationId: string,
  text: string,
): Promise<{ id: string }> {
  const body = text.trim().slice(0, MAX_MESSAGE);
  if (!body) throw new Error("Type something first.");
  if (!(await rateLimit(`chat:${user.id}`, 120, 3600)).ok) {
    throw new Error("You're sending messages very fast. Wait a moment.");
  }

  const { msg, conv } = await withHub(user.id, async (tx) => {
    const conv = await getConversation(tx, user.id, conversationId);
    if (!conv || conv.kind === "AI") throw new Error("Not found.");
    const now = new Date();
    const msg = await tx.chatMessage.create({
      data: { conversationId, authorId: user.id, role: "USER", body },
      select: { id: true },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
    await tx.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      update: { lastReadAt: now },
      create: { conversationId, userId: user.id, lastReadAt: now },
    });
    return { msg, conv };
  });

  await notifyNewMessage(user, conv, body).catch(() => {});
  return msg;
}

async function notifyNewMessage(
  author: { id: string; name: string | null },
  conv: NonNullable<Awaited<ReturnType<typeof getConversation>>>,
  body: string,
) {
  let recipients: string[];
  let muted = new Set(conv.members.filter((m) => m.mutedAt).map((m) => m.userId));
  if (conv.kind === "HUB" && conv.hubId) {
    const ms = await prisma.hubMembership.findMany({
      where: { hubId: conv.hubId, status: "ACTIVE" },
      select: { userId: true },
    });
    recipients = ms.map((m) => m.userId);
    const seats = await prisma.conversationMember.findMany({
      where: { conversationId: conv.id, mutedAt: { not: null } },
      select: { userId: true },
    });
    muted = new Set(seats.map((s) => s.userId));
  } else {
    recipients = conv.members.map((m) => m.userId);
  }
  const targets = recipients.filter((id) => id !== author.id && !muted.has(id));
  if (targets.length === 0) return;
  const locales = await prisma.user.findMany({ where: { id: { in: targets } }, select: { id: true, locale: true } });
  const who = author.name?.trim() || "Life Hub";
  await Promise.all(
    locales.map((u) => {
      const lang = langOf(u.locale);
      const where =
        conv.kind === "HUB"
          ? ` · ${conv.hub?.name ?? ""}`
          : conv.kind === "GROUP"
            ? ` · ${conv.title ?? translate(lang, "Group")}`
            : "";
      return sendPushToUser(u.id, {
        title: `${who}${where}`,
        body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
        url: `/chats/${conv.id}`,
        // One notification per chat, replaced as messages arrive.
        tag: `chat-${conv.id}`,
      });
    }),
  );
}

export async function setMuted(userId: string, conversationId: string, muted: boolean) {
  await withHub(userId, async (tx) => {
    const c = await tx.conversation.findFirst({
      where: { id: conversationId, ...visibleConversations(userId) },
      select: { id: true },
    });
    if (!c) throw new Error("Not found.");
    await tx.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: { mutedAt: muted ? new Date() : null },
      create: { conversationId, userId, mutedAt: muted ? new Date() : null },
    });
  });
}

/** Leave a group (gives up your seat). Hub chats follow hub membership instead. */
export async function leaveGroup(userId: string, conversationId: string) {
  await withHub(userId, (tx) =>
    tx.conversationMember.deleteMany({
      where: { conversationId, userId, conversation: { kind: "GROUP" } },
    }),
  );
}

/** Delete your own message (soft: hidden, so the thread's shape stays). */
export async function deleteOwnMessage(userId: string, messageId: string) {
  const { count } = await withHub(userId, (tx) =>
    tx.chatMessage.updateMany({
      where: { id: messageId, authorId: userId, role: "USER" },
      data: { hidden: true, body: "" },
    }),
  );
  if (count === 0) throw new Error("Not found.");
}
