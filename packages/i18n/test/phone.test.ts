import { expect, it } from "vitest";

import { formatAlgerianPhone, normalizeAlgerianPhone } from "../src/phone.ts";

it.each([
  ["0550 12 34 56", "+213550123456"],
  ["+213 650 12 34 56", "+213650123456"],
  ["00213750123456", "+213750123456"],
  ["  ٠٥٥٠\u202f١٢-٣٤-٥٦  ", "+213550123456"],
  ["۰۵۵۰ ۱۲ ۳۴ ۵۶", "+213550123456"],
])("[I18N-04:formatter] normalizes %s to an E.164 Algerian mobile", (input, expected) => {
  expect(normalizeAlgerianPhone(input)).toBe(expected);
});

it("[I18N-04:formatter] displays an E.164 Algerian mobile in national groups", () => {
  expect(formatAlgerianPhone("+213550123456")).toBe("0550 12 34 56");
});

it.each([
  "",
  "+33650123456",
  "021123456",
  "0450123456",
  "055012345",
  "05501234567",
  "+2130550123456",
  "tel:0550123456",
  "0550123456 ext 1",
  "0550\n123456",
])("rejects unsupported or malformed phone input %s", (input) => {
  expect(normalizeAlgerianPhone(input)).toBeUndefined();
  expect(formatAlgerianPhone(input)).toBeUndefined();
});
