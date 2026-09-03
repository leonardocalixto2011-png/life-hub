import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "MEMBER";
};

/** Server-side: current DB user, or redirect to /login. Use in guarded layouts + actions. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user?.email) redirect("/login");

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function getUser(): Promise<SessionUser | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });
  return user?.email ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
}
