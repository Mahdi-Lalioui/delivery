import { getLocales } from "expo-localization";

export type AppLocale = "ar" | "fr" | "en";

/** Picks the first supported device language; French is the fallback, as on the web (I18N-01). */
export function pickLocale(languageCodes: readonly (string | null)[]): AppLocale {
  for (const code of languageCodes) {
    if (code === "ar" || code === "fr" || code === "en") return code;
  }
  return "fr";
}

export function deviceLocale(): AppLocale {
  return pickLocale(getLocales().map((locale) => locale.languageCode));
}

export function isRtl(locale: AppLocale): boolean {
  return locale === "ar";
}
