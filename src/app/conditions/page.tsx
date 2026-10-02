import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";
import { TERMS } from "@/content/legal/terms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conditions d'utilisation · Terms of use — Life Hub",
};

/** Public: listed in the `authorized` gate in src/auth.config.ts. */
export default async function ConditionsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <LegalPage doc={TERMS} langParam={lang} />;
}
