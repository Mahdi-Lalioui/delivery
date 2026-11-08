import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PitchCalculator } from "../src/marketing/pitch-calculator";
import { pitchComparison } from "../src/marketing/pitch";

test("[MER-22][BIL-01] compares 20–30% commission with the flat monthly fee", () => {
  expect(pitchComparison({ ordersPerDay: 20, averageTicketDzd: 1500, flatFeeDzd: 5000 })).toEqual({
    monthlySalesDzd: 900_000,
    commissionLowDzd: 180_000,
    commissionHighDzd: 270_000,
    flatFeeDzd: 5000,
    savingsLowDzd: 175_000,
  });
});

test("[BIL-01] never reports negative savings and clamps inputs to the slider ranges", () => {
  const tiny = pitchComparison({ ordersPerDay: 0, averageTicketDzd: 100, flatFeeDzd: 5000 });
  expect(tiny.monthlySalesDzd).toBe(1 * 300 * 30);
  expect(tiny.savingsLowDzd).toBe(0);
  const huge = pitchComparison({
    ordersPerDay: 10_000,
    averageTicketDzd: 99_999,
    flatFeeDzd: 5000,
  });
  expect(huge.monthlySalesDzd).toBe(300 * 30 * 10_000);
});

test("[MER-22] renders labelled sliders and the three bars in Arabic", () => {
  const { marketingPitch } = getMessages("ar");
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="ar" messages={{ marketingPitch }}>
      <PitchCalculator locale="ar" flatFeeDzd={5000} />
    </NextIntlClientProvider>,
  );
  expect(html.match(/type="range"/g)).toHaveLength(2);
  expect(html).toContain(marketingPitch.flatBar);
  expect(html).toContain("5 000 دج");
  expect(html.match(/class="pitch-bar /g)).toHaveLength(3);
});
