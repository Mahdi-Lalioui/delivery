import { expect, it } from "vitest";

import { getLocalizedContent } from "../src/content.ts";
import type { Locale } from "../src/locales.ts";

const translations = { ar: "كسكسي", fr: "Couscous au poulet", en: "Chicken couscous" };

type TranslationLocale = keyof typeof translations;

it.each<[Locale, [TranslationLocale, TranslationLocale, TranslationLocale]]>([
  ["ar", ["ar", "fr", "en"]],
  ["fr", ["fr", "ar", "en"]],
  ["en", ["en", "fr", "ar"]],
  ["en-XA", ["en", "fr", "ar"]],
])("[I18N-05] resolves %s content in order %j", (locale, [first, second, third]) => {
  expect(getLocalizedContent(translations, locale)).toBe(translations[first]);
  expect(getLocalizedContent({ ...translations, [first]: "" }, locale)).toBe(translations[second]);
  expect(getLocalizedContent({ ...translations, [first]: null, [second]: " \t " }, locale)).toBe(
    translations[third],
  );
});

it("[I18N-05] returns no value when every translation is missing or blank", () => {
  expect(getLocalizedContent({}, "en")).toBeUndefined();
  expect(getLocalizedContent({ ar: null, fr: "", en: " \t " }, "ar")).toBeUndefined();
});
