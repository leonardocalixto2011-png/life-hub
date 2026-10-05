"use client";

import { useEffect } from "react";

import { useT } from "@/components/I18nProvider";
import { Logo } from "@/components/Logo";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      <Logo size={56} className="mb-2" />
      <p className="display text-2xl">{t("Something broke")}</p>
      <p className="text-sm text-[var(--color-text-dim)]">
        {t("That’s on us. Try again — if it keeps happening, note what you were doing.")}
      </p>
      <button onClick={reset} className="btn btn-primary">
        {t("Try again")}
      </button>
    </main>
  );
}
