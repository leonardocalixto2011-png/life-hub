import Link from "next/link";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { aiEnabled, AI_MODEL } from "@/lib/ai";
import { AssistantPanel } from "./AssistantPanel";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  await requireUser();
  const t = await getT();
  const enabled = aiEnabled();

  return (
    <div className="page">
      <div>
        <Link href="/today" className="back-link">
          {t("Today")}
        </Link>
        <h1 className="page-title">{t("Assistant")}</h1>
        <p className="text-xs text-[var(--color-text-dim)]">{t("Powered by Claude ({model}).", { model: AI_MODEL })}</p>
      </div>

      {enabled ? (
        <AssistantPanel />
      ) : (
        <div className="card p-4 text-sm">
          <p className="font-semibold">{t("Not set up yet")}</p>
          {/* Setup notes for whoever runs the deployment; the env names and
              model ids stay literal in either language. */}
          <p className="mt-1 text-[var(--color-text-dim)]">
            {t(
              "Add {key} to the environment (locally in .env, in production in the Vercel project). The model defaults to {model}; set {modelVar} to a smaller model to cut cost.",
              { key: "ANTHROPIC_API_KEY", model: "claude-opus-5", modelVar: "ANTHROPIC_MODEL" },
            )}
          </p>
        </div>
      )}
    </div>
  );
}
