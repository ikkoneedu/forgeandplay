export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://forgeandplay.com";

export const SITE_NAME = "Forge&Play";

export const LOCALES = ["tr", "en", "es", "zh"] as const;
export const DEFAULT_LOCALE = "tr";

export const OG_LOCALE: Record<string, string> = {
  tr: "tr_TR",
  en: "en_US",
  es: "es_ES",
  zh: "zh_CN",
};
