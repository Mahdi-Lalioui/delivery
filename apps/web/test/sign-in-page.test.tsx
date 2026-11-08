import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinSignIn, {
  generateMetadata as generateLatinSignInMetadata,
} from "../src/app/[locale]/sign-in/page";
import ArabicSignIn, {
  generateMetadata as generateArabicSignInMetadata,
} from "../src/app/ar/sign-in/page";
import { Home } from "../src/components/home";

// Use the real catalogs without the Next.js request context.
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

test("[AUTH-05] Arabic admin sign-in localizes the page and keeps admin mode across language links", async () => {
  const props = { searchParams: Promise.resolve({ purpose: "admin" }) };
  const { auth, shell } = getMessages("ar");
  const html = await render(<ArabicSignIn {...props} />);

  expect(html).toContain(`<h1 id="sign-in-title">${auth.adminTitle}</h1>`);
  expect(html).toContain(auth.phoneLabel);
  expect(html).toMatch(new RegExp(`<nav\\b[^>]*aria-label="${RegExp.escape(shell.languages)}"`));
  expect(html).toMatch(/<a\b[^>]*href="\/fr\/sign-in\?purpose=admin"[^>]*>Français<\/a>/);
  expect(html).toMatch(/<a\b[^>]*href="\/en\/sign-in\?purpose=admin"[^>]*>English<\/a>/);

  await expect(generateArabicSignInMetadata(props)).resolves.toEqual({
    title: auth.adminTitle,
    robots: { index: false, follow: false },
  });
});

test("[CUS-10] the French sign-in route treats an ambiguous admin query as ordinary sign-in", async () => {
  const props = {
    params: Promise.resolve({ locale: "fr" }),
    searchParams: Promise.resolve({ purpose: ["admin", "admin"] }),
  };
  const { auth } = getMessages("fr");
  const html = await render(<LatinSignIn {...props} />);

  expect(html).toContain(`<h1 id="sign-in-title">${auth.title}</h1>`);
  expect(html).toContain(auth.phoneDescription);
  expect(html).toMatch(/<a\b[^>]*href="\/ar\/sign-in"[^>]*>العربية<\/a>/);
  expect(html).not.toContain("?purpose=");
  expect(html).not.toContain(auth.adminTitle);

  await expect(generateLatinSignInMetadata(props)).resolves.toEqual({
    title: auth.title,
    robots: { index: false, follow: false },
  });
});

test("[CUS-10] the public home links to sign-in in the current locale", async () => {
  const html = await render(<Home locale="fr" />);
  const title = RegExp.escape(getMessages("fr").auth.title);

  expect(html).toMatch(new RegExp(`<a\\b[^>]*href="/fr/sign-in"[^>]*>${title}</a>`));
});
