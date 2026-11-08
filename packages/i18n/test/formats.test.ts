import { expect, it } from "vitest";

import { formatAlgiersDate, formatAlgiersTime, formatDzd } from "../src/formats.ts";
import type { PublicLocale } from "../src/locales.ts";

it.each<[PublicLocale, string]>([
  ["ar", "8 فيفري"],
  ["fr", "8 février"],
  ["en", "February 8"],
])("[I18N-02] shows the Algiers calendar date in %s", (locale, expected) => {
  expect(formatAlgiersDate(new Date("2027-02-07T23:30:00Z"), locale)).toBe(expected);
});

it.each<PublicLocale>(["ar", "fr", "en"])(
  "[I18N-02] shows Algiers time in %s using Latin digits and the 00–23 clock",
  (locale) => {
    expect(formatAlgiersTime(new Date("2027-02-07T23:30:00Z"), locale)).toBe("00:30");
    expect(formatAlgiersTime(Date.parse("2027-02-08T18:30:00Z"), locale)).toBe("19:30");
  },
);

it.each<[PublicLocale, string]>([
  ["ar", "دج"],
  ["fr", "DA"],
  ["en", "DA"],
])("[I18N-03:formatter] formats whole dinars in %s", (locale, unit) => {
  expect(formatDzd(0, locale)).toBe(`0 ${unit}`);
  expect(formatDzd(1450, locale)).toBe(`1\u202f450 ${unit}`);
  expect(formatDzd(-1000450, locale)).toBe(`-1\u202f000\u202f450 ${unit}`);
});

it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects an amount that cannot represent exact whole dinars (%s)",
  (amountDzd) => {
    expect(() => formatDzd(amountDzd, "fr")).toThrow(RangeError);
  },
);
