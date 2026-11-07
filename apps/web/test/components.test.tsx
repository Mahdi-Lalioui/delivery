import { brand } from "@zaafran/config/brand";
import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { DesignGuide } from "../src/components/design-guide";
import { Home, homeMetadata } from "../src/components/home";
import { SiteShell } from "../src/components/site-shell";

// React DOM runs here without Next's request store.
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

const locales: readonly (readonly ["ar" | "fr", string])[] = [
  ["ar", brand.arabicName],
  ["fr", brand.name],
];

test.each(locales)(
  "[M0-8] the %s home renders its localized introduction",
  async (locale, name) => {
    const html = await render(<Home locale={locale} />);
    const { home, shell } = getMessages(locale);

    expect(html).toContain(`<h1>${name}</h1>`);
    expect(html).toContain(home.description);
    expect(html).toMatch(new RegExp(`<nav\\b[^>]*aria-label="${RegExp.escape(shell.languages)}"`));
    expect(html).toMatch(/<a\b[^>]*href="\/ar"[^>]*>العربية<\/a>/);
    expect(html).toMatch(/<a\b[^>]*href="\/fr"[^>]*>Français<\/a>/);
    expect(html).toMatch(/<a\b[^>]*href="\/en"[^>]*>English<\/a>/);
  },
);

test("[I18N-01] public metadata lists the three public language alternatives", () => {
  const expected = { "ar-DZ": "/ar", "fr-DZ": "/fr", en: "/en" };

  expect(homeMetadata("ar").alternates?.languages).toEqual(expected);
  expect(homeMetadata("fr").alternates?.languages).toEqual(expected);
  expect(homeMetadata("ar").title).toBe(brand.arabicName);
  expect(homeMetadata("fr").title).toBe(brand.name);
});

test("[I18N-01] the shell preserves the guide path when switching languages", async () => {
  const html = await render(
    <SiteShell locale="ar" subpath="/dev/design">
      <h1>Guide sample</h1>
    </SiteShell>,
  );

  expect(html).toMatch(/<a\b[^>]*href="#content"[^>]*>انتقل إلى المحتوى<\/a>/);
  expect(html).toMatch(/<main\b[^>]*id="content"[^>]*><h1>Guide sample<\/h1><\/main>/);
  expect(html).toMatch(
    /<a\b(?=[^>]*href="\/ar\/dev\/design")(?=[^>]*dir="rtl")(?=[^>]*aria-current="page")[^>]*>العربية<\/a>/,
  );
  expect(html).toMatch(/<a\b[^>]*href="\/fr\/dev\/design"[^>]*>Français<\/a>/);
  expect(html).toMatch(/<a\b[^>]*href="\/en\/dev\/design"[^>]*>English<\/a>/);
});

test.each(["ar", "fr"] as const)(
  "[M0-8] the %s design guide exposes accessible samples",
  async (locale) => {
    const html = await render(<DesignGuide locale={locale} />);
    const { guide } = getMessages(locale);

    expect(html).toContain(`<h1>${guide.title}</h1>`);
    expect(html).toContain(`<h2>${guide.palette}</h2>`);
    expect(html).toContain(`<h2>${guide.typography}</h2>`);
    expect(html).toContain(guide.bodySample);
    expect(html).toContain(guide.danger);
    expect(html).toMatch(
      new RegExp(`<a\\b[^>]*href="#palette"[^>]*>${RegExp.escape(guide.primary)}</a>`),
    );
    expect(html).toMatch(
      new RegExp(`<button\\b[^>]*\\bdisabled=""[^>]*>${RegExp.escape(guide.disabled)}</button>`),
    );
    expect(html).toMatch(
      new RegExp(
        `<label\\b[^>]*>${RegExp.escape(guide.field)}<input\\b[^>]*` +
          `placeholder="${RegExp.escape(guide.placeholder)}"[^>]*></label>`,
      ),
    );
  },
);
