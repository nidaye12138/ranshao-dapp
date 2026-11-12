"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { interpolate, messages, type MessageTree } from "./messages";
import {
  detectBrowserLocale,
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from "./types";

type Vars = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: MessageTree;
  t: (path: string, vars?: Vars) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getByPath(tree: MessageTree, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredLocale();
    const next = stored ?? detectBrowserLocale();
    setLocaleState(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const tree = messages[locale];

  const t = useCallback(
    (path: string, vars?: Vars) => {
      const value = getByPath(tree, path);
      if (typeof value !== "string") {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[i18n] missing string: ${path}`);
        }
        return path;
      }
      return interpolate(value, vars);
    },
    [tree],
  );

  const value = useMemo(
    () => ({ locale, setLocale, messages: tree, t }),
    [locale, setLocale, tree, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

/** Localize API / ledger layer labels while keeping Chinese keys as data keys. */
export function localizeLayerLabel(label: string, locale: Locale): string {
  const m = messages[locale].layers;
  if (label === "直推" || label === "Direct") return m.direct;
  if (label === "间推" || label === "Indirect") return m.indirect;
  if (label === "市场" || label === "Market") return m.market;
  const marketMatch = /^(?:市场|Market)(\d)$/.exec(label);
  if (marketMatch) return interpolate(m.marketN, { n: marketMatch[1] });
  return label;
}
