import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";
import { StaleSession } from "./StaleSession";
import { signupsOpen } from "@/lib/signup";
import { getT } from "@/lib/i18n-server";
import { LegalLinks } from "@/components/LegalPage";

export default async function LoginPage() {
  // The database, not the cookie, decides. `auth()` alone only proves the
  // browser holds a signed JWT; every page behind the login needs the user
  // row as well (`requireUser`). Redirecting on the JWT sent a deleted or
  // reseeded account to /today, which sent it straight back here, forever.
  const [session, user] = await Promise.all([auth(), getUser()]);
  if (user) redirect("/today");
  const stale = Boolean(session?.user);
  const t = await getT();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Life Hub</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
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
      <LoginForm open={signupsOpen()} />
      {/* Bilingual on purpose: nobody is signed in yet, so there is no chosen
          language — and French comes first in Québec. */}
      <footer>
        <LegalLinks
          privacy="Confidentialité · Privacy"
          terms="Conditions · Terms"
          className="text-center text-xs text-[var(--color-text-dim)]"
        />
      </footer>
    </main>
  );
}
