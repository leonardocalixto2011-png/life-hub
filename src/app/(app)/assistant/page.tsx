import Link from "next/link";

import { requireUser } from "@/lib/session";
import { aiEnabled, AI_MODEL } from "@/lib/ai";
import { AssistantPanel } from "./AssistantPanel";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  await requireUser();
  const enabled = aiEnabled();

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← Today
        </Link>
        <h1 className="mt-1 text-lg font-bold">Assistant</h1>
        <p className="text-xs text-[var(--color-text-dim)]">Powered by Claude ({AI_MODEL}).</p>
      </div>

      {enabled ? (
        <AssistantPanel />
      ) : (
        <div className="card p-4 text-sm">
          <p className="font-semibold">Not set up yet</p>
          <p className="mt-1 text-[var(--color-text-dim)]">
            Add <code>ANTHROPIC_API_KEY</code> to the environment (locally in{" "}
            <code>.env</code>, in production in the Vercel project). The model
            defaults to <code>claude-opus-5</code>; set <code>ANTHROPIC_MODEL</code>
            to <code>claude-haiku-4-5</code> or <code>claude-sonnet-5</code> to cut cost.
          </p>
        </div>
      )}
    </div>
  );
}
