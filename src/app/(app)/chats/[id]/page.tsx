import { notFound } from "next/navigation";

import { PageHeader } from "@/components/SectionHeader";
import { conversationTitle, getConversation, listMessages, markRead, contactsFor } from "@/lib/chat";
import { withHub } from "@/lib/hub-context";
import { getLang, getT } from "@/lib/i18n-server";
import { requireHub } from "@/lib/session";
import { aiEnabled } from "@/lib/ai";
import { getWallet } from "@/lib/credits";
import { AssistantChat } from "@/components/chat/AssistantChat";
import { PeopleChat } from "@/components/chat/PeopleChat";
import { ChatSettings } from "./ChatSettings";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);

  const data = await withHub(user.id, async (tx) => {
    const conv = await getConversation(tx, user.id, id);
    if (!conv) return null;
    const rows = await listMessages(tx, id, { take: 80 });
    return { conv, rows: rows.reverse() };
  });
  if (!data) notFound();
  const { conv, rows } = data;
  await markRead(user.id, id);

  const wire = rows.map((m) => ({
    id: m.id,
    authorId: m.authorId,
    authorName: m.author?.name ?? null,
    authorAvatar: m.author?.avatarUrl ?? null,
    role: m.role,
    body: m.body,
    meta: m.meta,
    createdAt: m.createdAt.toISOString(),
  }));

  if (conv.kind === "AI") {
    const wallet = await getWallet(user.id);
    return (
      <div className="page">
        <PageHeader back={{ href: "/chats", label: t("Chats") }} title={t("Assistant")} sub={t("Working in {hub}", { hub: hub.name })} />
        <AssistantChat
          conversationId={conv.id}
          initial={wire}
          enabled={aiEnabled()}
          balanceMillicents={wallet.balanceMillicents}
          currency="CAD"
        />
      </div>
    );
  }

  const others = conv.members.filter((m) => m.userId !== user.id).map((m) => m.user);
  const me = conv.members.find((m) => m.userId === user.id);
  const title = conversationTitle({ ...conv, others }, lang);
  const contacts = conv.kind === "GROUP" ? await contactsFor(user.id) : [];
  const seated = new Set(conv.members.map((m) => m.userId));

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/chats", label: t("Chats") }}
        title={title}
        sub={
          conv.kind === "HUB"
            ? t("Everyone in the hub")
            : conv.kind === "GROUP"
              ? others.map((o) => o.name ?? t("Member")).join(", ")
              : undefined
        }
        action={
          (
            <ChatSettings
              conversationId={conv.id}
              kind={conv.kind}
              muted={Boolean(me?.mutedAt)}
              addable={contacts.filter((c) => !seated.has(c.id)).map((c) => ({ id: c.id, name: c.name ?? t("Member") }))}
            />
          )
        }
      />
      <PeopleChat conversationId={conv.id} meId={user.id} initial={wire} showNames={conv.kind !== "DIRECT"} />
    </div>
  );
}
