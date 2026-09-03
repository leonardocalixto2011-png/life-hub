import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Life Hub</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          Tasks, deadlines, subscriptions and budget for the crew — in one place.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
