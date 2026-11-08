import { pseudoLocale, type Locale, type PublicLocale } from "./locales.ts";

export type LocalizedContent = Readonly<Partial<Record<PublicLocale, string | null | undefined>>>;

const fallbackOrder = {
  ar: ["ar", "fr", "en"],
  fr: ["fr", "ar", "en"],
  en: ["en", "fr", "ar"],
} satisfies Record<PublicLocale, readonly PublicLocale[]>;

export function getLocalizedContent(content: LocalizedContent, locale: Locale): string | undefined {
  const preferred = locale === pseudoLocale ? "en" : locale;
  for (const candidate of fallbackOrder[preferred]) {
    const translation = content[candidate];
    if (translation?.trim()) return translation;
  }
  return undefined;
}
