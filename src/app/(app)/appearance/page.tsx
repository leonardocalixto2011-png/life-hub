import Link from "next/link";

import { requireUser } from "@/lib/session";
import { BackgroundUploadForm } from "./BackgroundUploadForm";
import { removeBackgroundImage } from "./actions";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  const user = await requireUser();

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← Today
        </Link>
        <h1 className="mt-1 text-lg font-bold">Appearance</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          Set your own background photo — only you see it; everyone else keeps
          their own.
        </p>
      </div>

      {user.backgroundImageUrl && (
        <div className="card overflow-hidden p-0">
          <img
            src={user.backgroundImageUrl}
            alt="Current background"
            className="h-32 w-full object-cover"
          />
        </div>
      )}

      <div className="card space-y-2 p-3">
        <div className="text-xs font-semibold">
          {user.backgroundImageUrl ? "Change background" : "Set a background"}
        </div>
        <BackgroundUploadForm />
      </div>

      {user.backgroundImageUrl && (
        <form action={removeBackgroundImage}>
          <button
            type="submit"
            className="w-full text-xs font-semibold text-[var(--color-danger)] underline"
          >
            Remove background
          </button>
        </form>
      )}
    </div>
  );
}
