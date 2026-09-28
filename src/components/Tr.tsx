"use client";

import { useT } from "@/components/I18nProvider";
import type { Vars } from "@/lib/i18n";

/**
 * A translated string for components that render in both server and client
 * trees (EmptyState, HubCover…) and so can't call `getT()` or `useT()`
 * themselves. `k` is the English text, as with `t()`.
 */
export function Tr({ k, vars }: { k: string; vars?: Vars }) {
  return <>{useT()(k, vars)}</>;
}
