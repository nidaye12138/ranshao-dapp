export type Locale = "zh" | "en";

export const LOCALES: Locale[] = ["zh", "en"];
export const LOCALE_STORAGE_KEY = "umidor.locale";

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = (navigator.language || "").toLowerCase();
  return lang.startsWith("zh") ? "zh" : "en";
}

export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "zh" || raw === "en") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}
