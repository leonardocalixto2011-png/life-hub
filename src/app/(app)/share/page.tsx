import Link from "next/link";

import { requireUser } from "@/lib/session";
import { listVentures } from "@/lib/data";
import { ShareCapture } from "./ShareCapture";

export const dynamic = "force-dynamic";

type SP = { title?: string; text?: string; url?: string };

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireUser();
  const sp = await searchParams;
  const ventures = await listVentures();

  const shared = [sp.title, sp.text, sp.url]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← Today
        </Link>
        <h1 className="mt-1 text-lg font-bold">Capture</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          Shared from another app. Turn it into tasks, events, deadlines or budget entries.
        </p>
      </div>

      <ShareCapture
        initialText={shared}
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </div>
  );
}
