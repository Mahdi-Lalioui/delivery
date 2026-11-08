import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MyOrdersView } from "../src/retention/my-orders";
import type { MyOrdersState } from "../src/retention/use-my-orders";
import { orderMockIds as ids, ordersMockState } from "./mocks/orders-handlers";

type Locale = "ar" | "fr" | "en";

function render(overrides: Partial<MyOrdersState>, locale: Locale = "fr") {
  const state: MyOrdersState = {
    history: { kind: "loading" },
    favourites: { kind: "loading" },
    receipt: undefined,
    reorderResult: undefined,
    isPaging: false,
    showReceipt: vi.fn(),
    orderAgain: vi.fn(),
    toggleFavourite: vi.fn(),
    loadMore: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
  const { retentionOrders } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={{ retentionOrders }}
      timeZone="Africa/Algiers"
    >
      <MyOrdersView state={state} locale={locale} />
    </NextIntlClientProvider>,
  );
}

const { orders } = ordersMockState();
const favourite = {
  merchantId: ids.merchantId,
  name: "Dar El Couscous",
  slug: "dar",
  coverMediaId: null,
  isOpen: true,
};

test("[CUS-21][CUS-23] shows favourites with a heart and order cards with status, code and total", () => {
  const html = render({
    history: { kind: "ready", orders, nextCursor: null },
    favourites: { kind: "ready", restaurants: [favourite] },
  });
  const { retentionOrders } = getMessages("fr");
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain(retentionOrders.status_delivered);
  expect(html).toContain("K7Q2");
  expect(html).toContain("2 350 DA");
  expect(html).toContain("orders-cover");
  // Only finished orders offer "Order again" (both mock orders are finished).
  expect(html.split(retentionOrders.orderAgain)).toHaveLength(3);
});

test("[CUS-21] flags unavailable dishes and changed prices when ordering again", () => {
  const [first] = orders;
  if (first === undefined) throw new Error("fixture missing");
  const reorderResult = {
    order: first,
    result: {
      kind: "ready" as const,
      reorder: {
        draft: { merchantId: ids.merchantId, items: [] },
        unavailable: [ids.soldOutItemId],
        priceChanges: [{ itemId: ids.itemId, oldDzd: 1500, newDzd: 1600 }],
      },
    },
  };
  const html = render(
    {
      history: { kind: "ready", orders, nextCursor: null },
      favourites: { kind: "ready", restaurants: [] },
      reorderResult,
    },
    "en",
  );
  expect(html).toContain("1 dish is no longer available");
  expect(html).toContain("1 500 DA → 1 600 DA");
});

test("[CUS-21] has empty, loading and error states", () => {
  const { retentionOrders } = getMessages("ar");
  expect(
    render(
      {
        history: { kind: "ready", orders: [], nextCursor: null },
        favourites: { kind: "ready", restaurants: [] },
      },
      "ar",
    ),
  ).toContain(retentionOrders.noOrdersBody);
  expect(render({}, "ar")).toContain('class="ui-skeleton"');
  expect(render({ history: { kind: "error" } }, "ar")).toContain(retentionOrders.retry);
});
