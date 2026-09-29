import Link from "next/link";

import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { resolveThemeId } from "@/lib/themes";
import { resolveLocale } from "@/lib/locales";
import { BackgroundUploadForm } from "./BackgroundUploadForm";
import { ThemePicker } from "./ThemePicker";
import { LocalePicker } from "./LocalePicker";
import { MotionToggle } from "@/components/MotionToggle";
import { removeBackgroundImage } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  const { user, hub } = await requireHub();
  const t = await getT();

  return (
    <div className="page">
      <div>
        <Link href="/today" className="back-link">
          {t("Today")}
        </Link>
        <h1 className="page-title">{t("Appearance")}</h1>
        <p className="page-sub">
          {t("Your theme and background are yours alone — everyone else in the hub keeps their own.")}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="section-title">
          {t("Theme")}
        </h2>
        <ThemePicker current={resolveThemeId(user.themeId)} />
        <p className="px-1 text-xs text-[var(--color-text-dim)]">
          {t("Each theme has a light and a dark version — it follows whatever your phone is set to.")}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="section-title">
          {t("Motion")}
        </h2>
        <MotionToggle />
      </section>

      <section className="space-y-2">
        <h2 className="section-title">
          {t("Language & format")}
        </h2>
        <LocalePicker current={resolveLocale(user.locale)} currency={hub.currency} />
      </section>

      <section className="space-y-2">
        <h2 className="section-title">
          {t("Background photo")}
        </h2>

        {user.backgroundImageUrl && (
          <div className="card overflow-hidden p-0">
            {/* A user-uploaded Blob URL; next/image would need remotePatterns for it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.backgroundImageUrl}
              alt={t("Current background")}
              className="h-32 w-full object-cover"
            />
          </div>
        )}

        <div className="card space-y-3 p-4">
          <div className="text-xs font-semibold">
            {user.backgroundImageUrl ? t("Change background") : t("Set a background")}
          </div>
          <BackgroundUploadForm />
        </div>

        {user.backgroundImageUrl && (
          <form action={removeBackgroundImage}>
            <SubmitButton className="w-full text-xs font-semibold text-[var(--color-danger)] underline" pendingLabel="…">
              {t("Remove background")}
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
