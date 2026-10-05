import { cache } from "react";
import { cookies } from "next/headers";

import { getUser } from "@/lib/session";
import { langOf, makeT, type Lang, type T } from "@/lib/i18n";

/** Signed-out visitors' choice from the login screen's language link. */
export const SIGNED_OUT_LANG_COOKIE = "lh_lang";

/**
 * The signed-in person's language. Signed out: French, unless the visitor
 * picked English on the login screen. French first is the Charter of the
 * French language's rule for Québec, the same call the legal pages make
 * (resolveLegalLang) — so no Accept-Language sniffing here either.
 */
export const getLang = cache(async (): Promise<Lang> => {
  const user = await getUser();
  if (user) return langOf(user.locale);
  const jar = await cookies();
  return jar.get(SIGNED_OUT_LANG_COOKIE)?.value === "en" ? "en" : "fr";
});

/** `const t = await getT()` at the top of any server component or action. */
export const getT = cache(async (): Promise<T> => makeT(await getLang()));
