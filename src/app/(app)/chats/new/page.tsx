import { PageHeader } from "@/components/SectionHeader";
import { Avatar } from "@/components/Avatar";
import { contactsFor } from "@/lib/chat";
import { getT } from "@/lib/i18n-server";
import { requireUser } from "@/lib/session";
import { startDirect } from "../actions";
import { NewGroupForm } from "./NewGroupForm";

export const dynamic = "force-dynamic";

/** Pick a person to message, or make a group. Only people you share a hub with. */
export default async function NewChatPage() {
  const user = await requireUser();
  const t = await getT();
  const contacts = await contactsFor(user.id);

  return (
    <div className="page">
      <PageHeader back={{ href: "/chats", label: t("Chats") }} title={t("New message")} />

      {contacts.length === 0 ? (
        <div className="card p-4 text-sm text-[var(--color-text-dim)]">
          {t("You can message the people you share a hub with. Invite someone to a hub first.")}
        </div>
      ) : (
        <>
          <ul className="list">
            {contacts.map((c) => (
              <li key={c.id}>
                <form action={startDirect.bind(null, c.id)}>
                  <button className="row w-full text-left">
                    <Avatar name={c.name} email={null} src={c.avatarUrl} size={36} />
                    <div className="row-main">
                      <div className="row-title">{c.name ?? t("Member")}</div>
                      {c.username && <div className="row-sub">@{c.username}</div>}
                    </div>
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <NewGroupForm contacts={contacts.map((c) => ({ id: c.id, name: c.name ?? t("Member") }))} />
        </>
      )}
    </div>
  );
}
