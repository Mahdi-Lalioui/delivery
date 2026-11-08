import { localeDetails, type Locale } from "./locales.ts";

const dinarNumber = new Intl.NumberFormat("en", {
  numberingSystem: "latn",
  useGrouping: "always",
  maximumFractionDigits: 0,
  signDisplay: "negative",
});

const algiersOptions = {
  timeZone: "Africa/Algiers",
  numberingSystem: "latn",
};

export function formatDzd(amountDzd: number, locale: Locale): string {
  if (!Number.isSafeInteger(amountDzd)) throw new RangeError("Expected whole dinars");

  const amount = dinarNumber
    .formatToParts(amountDzd)
    .map(({ type, value }) => (type === "group" ? "\u202f" : value))
    .join("");
  const unit = locale === "ar" ? "دج" : "DA";
  return `${amount} ${unit}`;
}

export function formatAlgiersDate(instant: Date | number, locale: Locale): string {
  return new Intl.DateTimeFormat(localeDetails[locale].tag, {
    ...algiersOptions,
    day: "numeric",
    month: "long",
  }).format(instant);
}

export function formatAlgiersTime(instant: Date | number, locale: Locale): string {
  return new Intl.DateTimeFormat(localeDetails[locale].tag, {
    ...algiersOptions,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}
