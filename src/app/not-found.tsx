import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-3xl font-bold">404</p>
      <p className="text-sm text-[var(--color-text-dim)]">That page doesn’t exist.</p>
      <Link href="/today" className="btn btn-primary">
        Back to Today
      </Link>
    </main>
  );
}
