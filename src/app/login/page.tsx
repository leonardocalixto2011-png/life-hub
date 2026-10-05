import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";
import { StaleSession } from "./StaleSession";
import { signupsOpen } from "@/lib/signup";
import { getLang, getT } from "@/lib/i18n-server";
import { Logo } from "@/components/Logo";
import { setSignedOutLang } from "./actions";
import { LegalLinks } from "@/components/LegalPage";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  // The database, not the cookie, decides. `auth()` alone only proves the
  // browser holds a signed JWT; every page behind the login needs the user
  // row as well (`requireUser`). Redirecting on the JWT sent a deleted or
  // reseeded account to /today, which sent it straight back here, forever.
  const [session, user] = await Promise.all([auth(), getUser()]);
  if (user) redirect("/today");
  // Auth.js sends people here with the page they were trying to open; it is
  // checked again server-side (safeNext) before it is used.
  const next = typeof callbackUrl === "string" ? callbackUrl.slice(0, 500) : undefined;
  const stale = Boolean(session?.user);
  const [t, lang] = await Promise.all([getT(), getLang()]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <Logo size={64} className="mb-5 drop-shadow-[0_10px_24px_rgb(79_70_229/0.35)]" />
        <h1 className="display text-4xl font-semibold tracking-tight">Life Hub</h1>
        <p className="mt-2 text-[var(--fs-row)] text-[var(--color-text-dim)]">
          {t("Tasks, deadlines, subscriptions and budget for the crew — in one place.")}
        </p>
      </div>
      {stale && (
        <>
          {/* Clears the dead cookie in the background; the form below works either way. */}
          <StaleSession />
          {/* Bilingual like the footer: with no account there is no chosen language. */}
          <p role="status" className="card p-4 text-sm text-[var(--color-text-dim)]">
            Ta session n&apos;est plus valide. Reconnecte-toi pour continuer.
            <br />
            Your session is no longer valid. Sign in again to continue.
          </p>
        </>
      )}
      <LoginForm open={signupsOpen()} next={next} />
      {/* Bilingual on purpose: nobody is signed in yet, so there is no chosen
          language — and French comes first in Québec. */}
      <footer className="space-y-3">
        <form action={setSignedOutLang} className="text-center">
          <input type="hidden" name="lang" value={lang === "fr" ? "en" : "fr"} />
          <button type="submit" className="text-xs font-medium text-[var(--color-primary)]">
            {lang === "fr" ? "English" : "Français"}
          </button>
        </form>
        <LegalLinks
          privacy="Confidentialité · Privacy"
          terms="Conditions · Terms"
          className="text-center text-xs text-[var(--color-text-dim)]"
        />
      </footer>
    </main>
  );
}
