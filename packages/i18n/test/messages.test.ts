import { expect, it } from "vitest";

import type { PublicLocale } from "../src/locales.ts";
import { formatItemCount } from "../src/messages.ts";

it.each([
  [0, "zero", "لا أصناف"],
  [1, "one", "صنف واحد"],
  [2, "two", "صنفان"],
  [3, "few", "3 أصناف"],
  [11, "many", "11 صنفًا"],
  [100, "other", "100 صنف"],
])("[I18N-06] formats Arabic count %s through the ICU %s form", (count, _form, expected) => {
  expect(formatItemCount(count, "ar")).toBe(expected);
});

it.each<[PublicLocale, string, string]>([
  ["fr", "1 article", "2 articles"],
  ["en", "1 item", "2 items"],
])("[I18N-06] formats singular and plural counts in %s", (locale, singular, plural) => {
  expect(formatItemCount(1, locale)).toBe(singular);
  expect(formatItemCount(2, locale)).toBe(plural);
});

it("expands pseudo-locale text while preserving the count and ICU selector", () => {
  expect(formatItemCount(1, "en-XA")).toMatch(/^\[1 ï+té+m\]$/);
  expect(formatItemCount(3, "en-XA")).toMatch(/^\[3 ï+té+ms\]$/);
});
