import Link from "next/link";

import { requireUser } from "@/lib/session";
import { resolveThemeId } from "@/lib/themes";
import { BackgroundUploadForm } from "./BackgroundUploadForm";
import { ThemePicker } from "./ThemePicker";
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
          Your theme and background are yours alone — everyone else in the hub
          keeps their own.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
          Theme
        </h2>
        <ThemePicker current={resolveThemeId(user.themeId)} />
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          Each theme has a light and a dark version — it follows whatever your
          phone is set to.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
          Background photo
        </h2>

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
      </section>
    </div>
  );
}
