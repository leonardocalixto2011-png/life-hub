"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-2xl font-bold">Something broke</p>
      <p className="text-sm text-[var(--color-text-dim)]">
        That’s on us. Try again — if it keeps happening, note what you were doing.
      </p>
      <button onClick={reset} className="btn btn-primary">
        Try again
      </button>
    </main>
  );
}
