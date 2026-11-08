export const publicLocales = ["ar", "fr", "en"] as const;
export type PublicLocale = (typeof publicLocales)[number];

export const defaultLocale = "fr";
export const pseudoLocale = "en-XA";
export type Locale = PublicLocale | typeof pseudoLocale;

export const localeDetails = {
  ar: { tag: "ar-DZ", direction: "rtl", name: "العربية" },
  fr: { tag: "fr-DZ", direction: "ltr", name: "Français" },
  en: { tag: "en", direction: "ltr", name: "English" },
  [pseudoLocale]: { tag: pseudoLocale, direction: "ltr" },
};

export function isPublicLocale(value: string | undefined): value is PublicLocale {
  return publicLocales.some((locale) => locale === value);
}
