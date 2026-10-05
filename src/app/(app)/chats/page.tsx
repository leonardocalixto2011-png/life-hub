import Link from "next/link";
import { MessageCirclePlus, Sparkles, Users, Home } from "lucide-react";

import { PageHeader } from "@/components/SectionHeader";
import { Avatar } from "@/components/Avatar";
import { listConversations, conversationTitle } from "@/lib/chat";
import { fmtShort, fmtTime } from "@/lib/i18n";
import { getLang, getT } from "@/lib/i18n-server";
import { requireUser } from "@/lib/session";
import { newAssistantChat } from "./actions";
import { isToday } from "date-fns";

export const dynamic = "force-dynamic";

/** Every conversation: the assistant first, then people, newest first. */
export default async function ChatsPage() {
  const user = await requireUser();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const rows = await listConversations(user.id);
  const ai = rows.filter((r) => r.kind === "AI").slice(0, 5);
  const people = rows.filter((r) => r.kind !== "AI");
  const when = (d: Date) => (isToday(d) ? fmtTime(d, lang) : fmtShort(d, lang));

  return (
    <div className="page">
      <PageHeader
        title={t("Chats")}
        sub={t("Talk to your assistant, or to the people you share a hub with.")}
        action={
          <Link href="/chats/new" className="btn btn-primary btn-sm" aria-label={t("New message")}>
            <MessageCirclePlus size={18} aria-hidden /> {t("New")}
          </Link>
        }
      />

      <section className="card p-4">
        <div className="flex items-center gap-3">
          <span className="icon-tile" aria-hidden>
            <Sparkles size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("Assistant")}</p>
            <p className="text-xs text-[var(--color-text-dim)]">
              {t("Ask it to add, find, change or tick off anything in the app.")}
            </p>
          </div>
          <form action={newAssistantChat}>
            <button className="btn btn-secondary btn-sm">{t("Talk")}</button>
          </form>
        </div>
        {ai.length > 0 && (
          <ul className="mt-3 space-y-1">
            {ai.map((c) => (
              <li key={c.id}>
                <Link href={`/chats/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2)]">
                  <span className="truncate">{c.last?.body?.slice(0, 80) || t("New conversation")}</span>
                  <span className="shrink-0 text-xs text-[var(--color-text-dim)]">{when(c.lastMessageAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title mb-2 px-1">{t("People")}</h2>
        {people.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--color-text-dim)]">
            {t("No chats yet. Start one with someone from your hub.")}
          </div>
        ) : (
          <ul className="list">
            {people.map((c) => {
              const title = conversationTitle(c, lang);
              const other = c.kind === "DIRECT" ? c.others[0] : null;
              return (
                <li key={c.id}>
                  <Link href={`/chats/${c.id}`} className="row">
                    {other ? (
                      <Avatar name={other.name} email={null} src={other.avatarUrl} size={36} />
                    ) : (
                      <span
                        className="icon-tile"
                        aria-hidden
                        style={c.hub ? { background: `color-mix(in srgb, ${c.hub.color} 18%, var(--color-surface))` } : undefined}
                      >
                        {c.kind === "HUB" ? <Home size={18} /> : <Users size={18} />}
                      </span>
                    )}
                    <div className="row-main">
                      <div className={`row-title ${c.unread ? "font-bold" : ""}`}>{title}</div>
                      <div className="row-sub truncate">
                        {c.last
                          ? `${c.last.authorId === user.id ? `${t("You")}: ` : ""}${c.last.body.slice(0, 80)}`
                          : c.kind === "HUB"
                            ? t("Everyone in the hub")
                            : t("No messages yet")}
                      </div>
                    </div>
                    <div className="row-end flex flex-col items-end gap-1">
                      {c.last && <span className="text-xs text-[var(--color-text-dim)]">{when(c.last.createdAt)}</span>}
                      {c.unread && <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" aria-label={t("Unread")} />}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
