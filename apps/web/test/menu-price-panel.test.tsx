import { formatDzd } from "@zaafran/i18n/formats";
import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import {
  BulkPricePanel,
  type BulkPriceControls,
} from "../src/menu-price/components/bulk-price-panel";
import { reduceBulkPrice, initialBulkPriceState } from "../src/menu-price/bulk-price-flow";
import type { BulkPriceSelection } from "../src/menu-price/bulk-price-http";

const itemId = "019d6abc-1234-7234-8234-123456789002";
const otherId = "019d6abc-1234-7234-8234-123456789004";
const batchId = "019d6abc-1234-7234-8234-123456789003";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const { menuPrice } = getMessages("ar");
const items = [
  { itemId, name: "طبق مشوي", priceDzd: 500 },
  { itemId: otherId, name: "شوربة", priceDzd: 1_200 },
];
const selection = {
  itemIds: [itemId],
  adjustment: { kind: "percent", basisPoints: 1_000 },
  roundingUnit: 10,
} satisfies BulkPriceSelection;
const preview = { sessionId, revision: 4, items: [{ itemId, oldPriceDzd: 500, newPriceDzd: 550 }] };
const previewed = reduceBulkPrice(initialBulkPriceState, {
  kind: "preview-loaded",
  selection,
  preview,
});
const applied = reduceBulkPrice(
  reduceBulkPrice(previewed, { kind: "apply-started", idempotencyKey: "k" }),
  {
    kind: "apply-finished",
    result: { kind: "saved", data: { batchId, revision: 5, items: preview.items } },
    atMs: 0,
  },
);

function controls(overrides: Partial<BulkPriceControls> = {}): BulkPriceControls {
  return {
    form: {
      selectedIds: new Set([itemId]),
      direction: "raise",
      mode: "percent",
      amount: "10",
      roundingUnit: 10,
      formError: null,
    },
    state: initialBulkPriceState,
    isUndoOffered: false,
    pending: false,
    changeForm: vi.fn(),
    toggleItem: vi.fn(),
    toggleAll: vi.fn(),
    preview: vi.fn(),
    apply: vi.fn(),
    undo: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function render(overrides: Partial<BulkPriceControls> = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={{ menuPrice }}>
      <BulkPricePanel locale="ar" items={items} controls={controls(overrides)} />
    </NextIntlClientProvider>,
  );
}

test("[MER-11] offers item, direction, mode, amount and rounding choices", () => {
  const html = render();
  expect(html).toContain(menuPrice.title);
  expect(html).toContain(menuPrice.selectAll);
  expect(html).toMatch(new RegExp(`id="bulk-price-item-${itemId}"[^>]*checked`));
  expect(html).not.toMatch(new RegExp(`id="bulk-price-item-${otherId}"[^>]*checked`));
  expect(html).toContain(menuPrice.raise);
  expect(html).toContain(menuPrice.lower);
  expect(html).toContain(menuPrice.percent);
  expect(html).toContain(menuPrice.fixed);
  expect(html).toMatch(/<option value="10" selected="">/);
  expect(html).toContain(menuPrice.preview);
  expect(html).not.toContain(menuPrice.apply);
});

test("[MER-11] shows the preview table old to new before apply", () => {
  const html = render({ state: previewed });
  expect(html).toContain(`<caption>${menuPrice.previewCaption}</caption>`);
  expect(html).toContain(formatDzd(500, "ar"));
  expect(html).toContain(formatDzd(550, "ar"));
  expect(html).toContain(menuPrice.apply);
});

test("[MER-11] offers undo only while the window is open", () => {
  expect(render({ state: applied, isUndoOffered: true })).toContain(menuPrice.undo);
  const closed = render({ state: applied, isUndoOffered: false });
  expect(closed).toContain(menuPrice.applied);
  expect(closed).not.toContain(menuPrice.undo);
});

test("[MER-11] explains a rejected undo and an invalid amount", () => {
  const rejectedState = reduceBulkPrice(
    reduceBulkPrice(applied, { kind: "undo-started", idempotencyKey: "u" }),
    { kind: "undo-finished", result: { kind: "price-changed" } },
  );
  const rejected = render({ state: rejectedState, isUndoOffered: true });
  expect(rejected).not.toContain(menuPrice.undo);
  expect(rejected).toContain(`role="alert"`);
  expect(rejected).toContain(menuPrice.failurePriceChanged);

  const invalid = render({
    form: { ...controls().form, amount: "abc", formError: "invalidAmount" },
  });
  expect(invalid).toContain(`aria-invalid="true"`);
  expect(invalid).toContain(menuPrice.invalidAmount);
});

test("[MER-11] reports an empty selection apart from the amount field", () => {
  const html = render({
    form: { ...controls().form, selectedIds: new Set(), formError: "noSelection" },
  });
  expect(html).toContain(`id="bulk-price-selection-error"`);
  expect(html).toContain(menuPrice.noSelection);
  expect(html).not.toContain(`id="bulk-price-amount-error"`);
  expect(html).not.toContain(`aria-invalid="true"`);
  expect(html).toMatch(/<fieldset[^>]*aria-describedby="bulk-price-selection-error"/);
});
