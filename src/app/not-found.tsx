import Link from "next/link";

import { getT } from "@/lib/i18n-server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-3xl font-bold">404</p>
      <p className="text-sm text-[var(--color-text-dim)]">{t("That page doesn’t exist.")}</p>
      <Link href="/today" className="btn btn-primary">
        {t("Back to Today")}
      </Link>
    </main>
  );
}
