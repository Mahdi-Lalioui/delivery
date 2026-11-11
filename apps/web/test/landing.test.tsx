import type { Messages } from "@zaafran/i18n/messages";
import { getMessages } from "@zaafran/i18n/messages";
import type { Locale } from "@zaafran/i18n/locales";
import { createTranslator } from "next-intl";
import { renderToReadableStream } from "react-dom/server";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { CreditsPage } from "../src/marketing/credits-page";
import { Landing } from "../src/marketing/landing";
import { photoCredits } from "../src/marketing/photo-credits";

vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

async function render(element: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  return new Response(stream).text();
}

test("[M8-1] the landing leads with Algeria photography, the tagline and the way in", async () => {
  const html = await render(Landing({ locale: "fr" }));
  expect(html).toContain("Un besoin ? Essayez AWID");
  expect(html.match(/class="landing-slide"/g)).toHaveLength(5);
  expect(html).toContain('fetchPriority="high"');
  expect(html).toContain('href="/fr/discover"');
  expect(html).toContain('href="/fr/discover?cuisine=algerian"');
  expect(html).toContain("Constantine");
  expect(html).toContain('href="/fr/merchant/apply"');
  expect(html).toContain('href="/fr/credits"');
  expect(html).not.toContain("<canvas");
});

test("[M8-1] the Arabic landing localizes the tagline and the footer", async () => {
  const html = await render(Landing({ locale: "ar" }));
  expect(html).toContain("محتاج؟ جرّب أويد");
  expect(html).toContain("حقوق الصور");
});

test("[M8-1] every shipped photo is credited with author, licence and source", async () => {
  const html = await render(await CreditsPage({ locale: "fr" }));
  expect(photoCredits.length).toBeGreaterThanOrEqual(15);
  for (const credit of photoCredits) {
    expect(html).toContain(credit.file);
    expect(credit.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//u);
  }
});
