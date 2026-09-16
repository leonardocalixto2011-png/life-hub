"use client";

import { createContext, useContext, useMemo } from "react";

import { makeT, type Lang, type T } from "@/lib/i18n";

const LangContext = createContext<Lang>("en");

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** Client-side twin of `getT()` — same dictionary, read from context. */
export function useT(): T {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}
