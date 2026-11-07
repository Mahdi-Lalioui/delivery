import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { loadItemCategoryRail } from "../src/menu-item/item-category-rail";
import {
  CategoryRailLinks,
  MenuItemCategoryRail,
} from "../src/menu-item/components/menu-item-category-rail";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const categoryId = "019d6abc-1234-7234-8234-123456789001";
const otherCategoryId = "019d6abc-1234-7234-8234-123456789002";
const sessionId = "019d6abc-1234-7234-8234-123456789003";
const otherSessionId = "019d6abc-1234-7234-8234-123456789004";
const revision = 3;
const current = { categoryId, names: { ar: "مشاوي" }, position: 0, availability: null };
const other = {
  categoryId: otherCategoryId,
  names: { fr: "Desserts" },
  position: 1,
  availability: null,
};
const path = `/ar/merchant/${merchantId}/menu`;
const expected = { sessionId, revision };
const { menuItem } = getMessages("ar");

afterEach(() => vi.unstubAllGlobals());

test("[MER-09:category-rail] reads the complete authorized category order", async () => {
  const cursor = `3~0~${categoryId}`;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ ...expected, categories: [current], nextCursor: cursor }),
    )
    .mockResolvedValueOnce(Response.json({ ...expected, categories: [other], nextCursor: null }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(loadItemCategoryRail({ merchantId, categoryId, expected, signal })).resolves.toEqual(
    {
      kind: "ready",
      categories: [current, other],
    },
  );
  const endpoint = `/v1/merchants/${merchantId}/menu/categories`;
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    endpoint + "?limit=100",
    expect.objectContaining({ signal, credentials: "same-origin", cache: "no-store" }),
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${endpoint}?limit=100&cursor=3%7E0%7E${categoryId}`,
    expect.any(Object),
  );
});

test.each([
  [{ sessionId: otherSessionId }, "session-changed"],
  [{ revision: 4 }, "revision-conflict"],
  [{ categories: [other] }, "error"],
] as const)(
  "[MER-09:category-rail] ignores a different session, stale revision or missing active category",
  async (override, kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...expected,
          categories: [current, other],
          nextCursor: null,
          ...override,
        }),
      ),
    );
    await expect(
      loadItemCategoryRail({
        merchantId,
        categoryId,
        expected,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ kind });
  },
);

test("[MER-09:category-rail] aborts without requesting categories", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    loadItemCategoryRail({ merchantId, categoryId, expected, signal: AbortSignal.abort() }),
  ).resolves.toEqual({ kind: "error" });
  expect(fetch).not.toHaveBeenCalled();
});

function renderLinks(blocked = false) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={{ menuItem }}>
      <CategoryRailLinks
        merchantId={merchantId}
        categoryId={categoryId}
        locale="ar"
        categories={[current, other]}
        blocked={blocked}
      />
    </NextIntlClientProvider>,
  );
}

test("[MER-09:category-rail] renders localized native category links and marks the current page", () => {
  const html = renderLinks();
  expect(html).toContain(`<nav aria-label="${menuItem.categoryNavigation}"`);
  expect(html).toContain(`href="${path}/${categoryId}/items" aria-current="page"`);
  expect(html).toContain(`href="${path}/${otherCategoryId}/items"`);
  expect(html.indexOf("مشاوي")).toBeLessThan(html.indexOf("Desserts"));
});

test("[MER-09:category-rail] leaves category names visible without navigable links during an edit", () => {
  const html = renderLinks(true);
  expect(html).toContain("مشاوي");
  expect(html).toContain("Desserts");
  expect(html).toContain('aria-current="page"');
  expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
  expect(html).not.toContain("href=");
});

test("[MER-09:category-rail] server markup has no speculative category links or request", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const html = renderToStaticMarkup(
    <MenuItemCategoryRail
      merchantId={merchantId}
      categoryId={categoryId}
      locale="ar"
      expected={expected}
      blocked={false}
      onAccessChanged={vi.fn()}
    />,
  );
  expect(html).toBe("");
  expect(fetch).not.toHaveBeenCalled();
});
