import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Home } from "../src/components/home";

vi.mock("next-intl/server", () => ({
  getTranslations: ({ namespace }: { namespace: string }) =>
    Promise.resolve((key: string) => namespace + "." + key),
}));
vi.mock("../src/components/site-shell", () => ({
  SiteShell: ({ children }: PropsWithChildren) => children,
}));

test("[MER-01:web] the public Arabic homepage links to restaurant signup", async () => {
  const html = renderToStaticMarkup(await Home({ locale: "ar" }));
  expect(html).toMatch(/<a[^>]*href="\/ar\/merchant\/apply"[^>]*>merchant.startApplication<\/a>/);
  expect(html).toContain('href="/ar/sign-in"');
});
