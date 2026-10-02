import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "./LoginForm";
import { signupsOpen } from "@/lib/signup";
import { getT } from "@/lib/i18n-server";
import { LegalLinks } from "@/components/LegalPage";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/today");
  const t = await getT();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Life Hub</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          {t("Tasks, deadlines, subscriptions and budget for the crew — in one place.")}
        </p>
      </div>
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
