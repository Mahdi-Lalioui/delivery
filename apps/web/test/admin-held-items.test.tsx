import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AdminHeldItems } from "../src/admin/admin-held-items";
import type { HeldItem } from "../src/admin/admin-moderation-http";
import { useAdminHeldItems, type AdminHeldItemsState } from "../src/admin/use-admin-held-items";

vi.mock("../src/admin/use-admin-held-items", () => ({ useAdminHeldItems: vi.fn() }));

const item: HeldItem = {
  itemId: "019d6abc-1234-7234-8234-123456789abc",
  merchantId: "019d6abc-1234-7234-8234-123456789def",
  restaurantName: "Cuisine fictive",
  names: { ar: "مشروب تجريبي", fr: "Bière pression" },
  descriptions: { fr: "Description fictive" },
  matches: ["alcohol"],
};
const sessionId = "019d6abc-1234-7234-8234-123456789aaa";
const ready = { kind: "ready", items: [item], sessionId, nextCursor: item.itemId } as const;

function render(overrides: Partial<AdminHeldItemsState>, locale: "fr" | "en" = "fr") {
  vi.mocked(useAdminHeldItems).mockReturnValue({
    view: { kind: "loading" },
    item: undefined,
    isPaging: false,
    isSaving: false,
    notice: undefined,
    select: vi.fn(),
    refresh: vi.fn(),
    loadMore: vi.fn(),
    save: vi.fn(),
    ...overrides,
  });
  const { adminModeration } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ adminModeration }}>
      <AdminHeldItems locale={locale} />
    </NextIntlClientProvider>,
  );
}

test("[ADM-04:web] lists held items with their restaurant and localized categories", () => {
  const html = render({ view: ready });
  const { adminModeration } = getMessages("fr");

  expect(html).toContain("<table");
  expect(html).toContain(item.restaurantName);
  expect(html).toContain("Bière pression");
  expect(html).toContain(adminModeration.categoryAlcohol);
  expect(html).toContain(adminModeration.loadMore);
  expect(html).toContain(adminModeration.selectItem);
  expect(html).not.toContain(sessionId);
  expect(html).not.toContain("<form");
});

test("[ADM-04:web] shows each language in its own direction and a labelled decision form", () => {
  const html = render({ view: ready, item });
  const { adminModeration } = getMessages("fr");

  expect(html).toContain('<bdi lang="ar-DZ" dir="rtl">مشروب تجريبي</bdi>');
  expect(html).toContain('<bdi lang="fr-DZ" dir="ltr">Description fictive</bdi>');
  for (const label of [
    adminModeration.approve,
    adminModeration.reject,
    adminModeration.reason,
    adminModeration.confirm,
  ]) {
    expect(html).toContain(label);
  }
  expect(html.match(/type="radio"/g)).toHaveLength(2);
  expect(html).toMatch(/<label[^>]*for="admin-item-reason"/);
  expect(html).toMatch(/<textarea(?=[^>]*id="admin-item-reason")(?=[^>]*maxLength="500")/i);
});

test("[ADM-04:web] explains an item whose text no longer matches a category", () => {
  const html = render({ view: { ...ready, items: [{ ...item, matches: [] }] } });
  expect(html).toContain(getMessages("fr").adminModeration.noMatches);
});

test.each(["fr", "en"] as const)(
  "[ADM-04:web] the %s signed-out view links to the admin sign-in continuation",
  (locale) => {
    const html = render({ view: { kind: "sign-in" } }, locale);
    expect(html).toContain(getMessages(locale).adminModeration.signInRequired);
    expect(html).toContain(`href="/${locale}/sign-in?continue=admin-moderation"`);
    expect(html).not.toContain("<table");
  },
);

test("[ADM-04:web] a stale review or changed session offers a manual refresh", () => {
  const { adminModeration } = getMessages("fr");
  const stale = render({ view: { ...ready, items: [] }, notice: "stale" });
  expect(stale).toContain(adminModeration.stale);
  expect(stale).toContain(adminModeration.refresh);
  expect(stale).not.toContain(adminModeration.confirm);

  const changed = render({ view: { kind: "session-changed" } });
  expect(changed).toContain(adminModeration.sessionChanged);
  expect(changed).not.toContain("<table");
});

test("[ADM-04:web] announces a decision and an empty queue", () => {
  const html = render({
    view: { kind: "ready", items: [], nextCursor: null, sessionId },
    notice: "approved",
  });
  const { adminModeration } = getMessages("fr");

  expect(html).toContain('role="status"');
  expect(html).toContain(adminModeration.approved);
  expect(html).toContain(adminModeration.empty);
});
