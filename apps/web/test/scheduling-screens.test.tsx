import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { IftarCountdown } from "../src/retention/iftar-countdown";
import { SlotPicker } from "../src/retention/slot-picker";

type Locale = "ar" | "fr" | "en";

function wrap(node: React.ReactNode, locale: Locale) {
  const { retentionScheduling } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={{ retentionScheduling }}
      timeZone="Africa/Algiers"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

const slots = [
  { kind: "iftar" as const, scheduledFor: "2027-02-10T18:05:00+01:00" },
  { kind: "scheduled" as const, scheduledFor: "2027-02-10T19:00:00+01:00" },
  { kind: "scheduled" as const, scheduledFor: "2027-02-11T12:15:00+01:00" },
];

test("[CUS-13][HRS-03] offers ASAP, the Iftar quick slot and slots grouped by day", () => {
  const html = wrap(<SlotPicker slots={slots} value={{ kind: "asap" }} onChange={vi.fn()} />, "fr");
  const { retentionScheduling } = getMessages("fr");
  expect(html).toContain(retentionScheduling.asap);
  expect(html).toContain("Arrivée à 18:05");
  expect(html).toContain(">19:00<");
  expect(html).toContain('data-tone="iftar"');
  expect(html.match(/<fieldset class="slot-day"/g)).toHaveLength(2);
  expect(html.match(/type="radio"/g)).toHaveLength(4);
  expect(html.match(/checked=""/g)).toHaveLength(1);
});

test("[CUS-13] marks the chosen scheduled slot", () => {
  const value = slots[1] ?? { kind: "asap" as const };
  const html = wrap(<SlotPicker slots={slots} value={value} onChange={vi.fn()} />, "ar");
  expect(html.match(/checked=""/g)).toHaveLength(1);
});

test("[HRS-03] renders the Maghrib time without depending on the server clock", () => {
  const html = wrap(<IftarCountdown maghribAt="2027-02-10T18:10:00+01:00" />, "en");
  expect(html).toContain("Iftar today at 6:10");
  expect(html).not.toContain('role="timer"');
});
