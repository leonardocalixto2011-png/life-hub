import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { aiEnabled } from "@/lib/ai";
import { getWallet } from "@/lib/credits";
import { PageHeader } from "@/components/SectionHeader";
import { AssistantChat } from "@/components/chat/AssistantChat";
import { AiNotice } from "@/components/AiNotice";

export const dynamic = "force-dynamic";

/**
 * A fresh conversation with the assistant. The first message creates the
 * chat (it then lives under /chats like any other); this page is the
 * shortcut the header and home-screen icons open.
 */
export default async function AssistantPage() {
  const { user, hub } = await requireHub();
  const t = await getT();
  const enabled = aiEnabled();
  const wallet = enabled ? await getWallet(user.id) : null;

  return (
    <div className="page">
      <PageHeader back={{ href: "/chats", label: t("Chats") }} title={t("Assistant")} sub={t("Working in {hub}", { hub: hub.name })} />

      {enabled && !user.aiNoticeAt && <AiNotice />}

      {enabled ? (
        <AssistantChat conversationId={null} initial={[]} enabled balanceMillicents={wallet?.balanceMillicents ?? 0} currency="CAD" />
      ) : (
        <div className="card p-4 text-sm">
          <p className="font-semibold">{t("Not set up yet")}</p>
          <p className="mt-1 text-[var(--color-text-dim)]">
            {t(
              "Add {key} to the environment (locally in .env, in production in the Vercel project). The model defaults to {model}; set {modelVar} to a smaller model to cut cost.",
              { key: "ANTHROPIC_API_KEY", model: "claude-opus-5-5", modelVar: "ANTHROPIC_MODEL" },
            )}
          </p>
        </div>
      )}
    </div>
  );
}
