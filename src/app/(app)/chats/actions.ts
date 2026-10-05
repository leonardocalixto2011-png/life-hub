"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHub, requireUser } from "@/lib/session";
import { withHub } from "@/lib/hub-context";
import { langOf } from "@/lib/i18n";
import { formResult, type ActionResult } from "@/lib/action-result";
import {
  addToGroup,
  createAiChat,
  createGroup,
  deleteOwnMessage,
  getConversation,
  leaveGroup,
  listMessages,
  markRead,
  openDirect,
  postMessage,
  setMuted,
} from "@/lib/chat";
import { resolvePending } from "@/lib/assistant/agent";

const id = z.string().cuid();

/** Tap a person → the chat with them (made on first use). */
export async function startDirect(otherId: string) {
  const user = await requireUser();
  const conv = await openDirect(user.id, id.parse(otherId));
  redirect(`/chats/${conv}`);
}

export async function startGroup(formData: FormData): Promise<ActionResult> {
  let conv = "";
  const r = await formResult(async () => {
    const user = await requireUser();
    const title = String(formData.get("title") ?? "");
    const members = formData.getAll("memberIds").map(String).filter((x) => id.safeParse(x).success);
    conv = await createGroup(user.id, title, members);
  });
  if (r.error) return r;
  redirect(`/chats/${conv}`);
}

export async function addGroupMembers(conversationId: string, formData: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    const members = formData.getAll("memberIds").map(String).filter((x) => id.safeParse(x).success);
    await addToGroup(user.id, id.parse(conversationId), members);
    revalidatePath(`/chats/${conversationId}`);
  });
}

/** A new, empty conversation with the assistant. */
export async function newAssistantChat() {
  const { user, hub } = await requireHub();
  const conv = await createAiChat(user.id, hub.id);
  redirect(`/chats/${conv}`);
}

export async function sendChatMessage(conversationId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    await postMessage(user, id.parse(conversationId), text);
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.constructor === Error) return { ok: false, error: e.message };
    throw e;
  }
}

export type WireMessage = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  role: "USER" | "ASSISTANT";
  body: string;
  meta: unknown;
  createdAt: string;
};

/** New messages since `after` (ISO) — the open chat polls this. Also moves the read marker. */
export async function pollMessages(conversationId: string, after: string | null): Promise<WireMessage[]> {
  const user = await requireUser();
  const conv = id.parse(conversationId);
  const since = after ? new Date(after) : undefined;
  const rows = await withHub(user.id, async (tx) => {
    const c = await getConversation(tx, user.id, conv);
    if (!c) return [];
    return listMessages(tx, conv, { after: since && !Number.isNaN(since.getTime()) ? since : undefined, take: 100 });
  });
  if (rows.length) await markRead(user.id, conv);
  const list = since ? rows : [...rows].reverse();
  return list.map((m) => ({
    id: m.id,
    authorId: m.authorId,
    authorName: m.author?.name ?? null,
    authorAvatar: m.author?.avatarUrl ?? null,
    role: m.role,
    body: m.body,
    meta: m.meta,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function muteChat(conversationId: string, muted: boolean) {
  const user = await requireUser();
  await setMuted(user.id, id.parse(conversationId), muted);
  revalidatePath(`/chats/${conversationId}`);
}

export async function leaveChat(conversationId: string) {
  const user = await requireUser();
  await leaveGroup(user.id, id.parse(conversationId));
  redirect("/chats");
}

export async function deleteChatMessage(messageId: string) {
  const user = await requireUser();
  await deleteOwnMessage(user.id, id.parse(messageId));
}

/** Delete one of your own assistant conversations, whole. */
export async function deleteAssistantChat(conversationId: string) {
  const user = await requireUser();
  await withHub(user.id, (tx) =>
    tx.conversation.deleteMany({ where: { id: id.parse(conversationId), kind: "AI", createdById: user.id } }),
  );
  redirect("/chats");
}

/** Confirm or cancel something the assistant prepared (a deletion, a message to someone). */
export async function confirmAssistantAction(messageId: string, pendingId: string, approve: boolean) {
  const { user, hub } = await requireHub();
  return resolvePending(
    { user, hub, lang: langOf(user.locale) },
    id.parse(messageId),
    z.string().min(1).max(200).parse(pendingId),
    approve === true,
  );
}
