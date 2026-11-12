import type { Messages } from "@zaafran/i18n/messages";
import { getMessages } from "@zaafran/i18n/messages";
import type { Locale } from "@zaafran/i18n/locales";
import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AccountHub } from "../src/account/account-hub";

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

test("[CUS-21][CUS-23] the profile tab links to orders, favourites, devices and privacy", async () => {
  const html = await render(await AccountHub({ locale: "ar" }));
  expect(html).toContain('href="/ar/orders"');
  expect(html).toContain('href="/ar/orders#orders-favourites"');
  expect(html).toContain('href="/ar/account/sessions"');
  expect(html).toContain('href="/ar/account/privacy"');
  expect(html).toContain('href="/ar/account" aria-current="page"');
  expect(html).toContain("حسابي");
});
