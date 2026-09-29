import { PageHeader } from "@/components/SectionHeader";

import { requireHub } from "@/lib/session";
import { hubChrome } from "@/lib/data";
import { getT } from "@/lib/i18n-server";
import { ShareCapture } from "./ShareCapture";

export const dynamic = "force-dynamic";

type SP = {
  title?: string;
  text?: string;
  url?: string;
  /** Set by public/sw.js when it parked shared photos in the Cache API. */
  shared?: string;
  /** Images beyond the first 3, dropped. */
  more?: string;
  /** Non-image files, dropped. */
  skipped?: string;
  /** The no-service-worker fallback received a file it could not keep. */
  nofile?: string;
  shareError?: string;
};

const count = (v?: string) => Math.max(0, Math.min(99, Number.parseInt(v ?? "", 10) || 0));

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { user, hub } = await requireHub();
  const sp = await searchParams;
  const t = await getT();
  const { ventures } = await hubChrome(user.id, hub.id);

  const shared = [sp.title, sp.text, sp.url]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/today", label: t("Today") }}
        title={t("Capture")}
        sub={t("Shared from another app. Turn it into tasks, events, deadlines or budget entries.")}
      />

      <ShareCapture
        initialText={shared}
        userId={user.id}
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        sharedImages={sp.shared === "1"}
        notices={{
          more: count(sp.more),
          skipped: count(sp.skipped),
          noFile: sp.nofile === "1",
          error: sp.shareError === "1",
        }}
      />
    </div>
  );
}
