"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  detectMiniLocale,
  saveMiniLocale,
  t as translate,
  type MiniLocale,
  type MiniMsgKey,
} from "./i18n";

type MiniI18nValue = {
  locale: MiniLocale;
  setLocale: (l: MiniLocale) => void;
  t: (
    key: MiniMsgKey,
    vars?: Record<string, string | number | null | undefined>
  ) => string;
};

const MiniI18nContext = createContext<MiniI18nValue | null>(null);

export function MiniI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<MiniLocale>(() =>
    typeof window === "undefined" ? "en" : detectMiniLocale()
  );

  const setLocale = useCallback((l: MiniLocale) => {
    setLocaleState(l);
    saveMiniLocale(l);
  }, []);

  const value = useMemo<MiniI18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale]
  );

  return (
    <MiniI18nContext.Provider value={value}>{children}</MiniI18nContext.Provider>
  );
}

export function useMiniI18n(): MiniI18nValue {
  const ctx = useContext(MiniI18nContext);
  if (!ctx) {
    // Safe fallback outside provider (SSR / tests)
    return {
      locale: "en",
      setLocale: () => {},
      t: (key, vars) => translate("en", key, vars),
    };
  }
  return ctx;
}
