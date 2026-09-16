import { cache } from "react";

import { getUser } from "@/lib/session";
import { langOf, makeT, type Lang, type T } from "@/lib/i18n";

/** The signed-in person's language, or English when signed out. */
export const getLang = cache(async (): Promise<Lang> => {
  const user = await getUser();
  return langOf(user?.locale);
});

/** `const t = await getT()` at the top of any server component or action. */
export const getT = cache(async (): Promise<T> => makeT(await getLang()));
