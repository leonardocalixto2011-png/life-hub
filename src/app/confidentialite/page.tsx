import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";
import { PRIVACY } from "@/content/legal/privacy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Politique de confidentialité · Privacy policy — Life Hub",
};

/** Public: listed in the `authorized` gate in src/auth.config.ts. */
export default async function ConfidentialitePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <LegalPage doc={PRIVACY} langParam={lang} />;
}
