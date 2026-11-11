import { configureCartLine, type CartItem, type CartLine, type CartOptionGroup } from "./cart.ts";
import { dzd } from "./money.ts";
import { priceOrder } from "./pricing.ts";
import { fail } from "./result.ts";

type QuoteLine = {
  readonly item: CartItem;
  readonly groups: readonly CartOptionGroup[];
  readonly optionIds: readonly string[];
  readonly quantity: number;
  readonly note?: string;
};

type QuoteInput = {
  readonly lines: readonly QuoteLine[];
  readonly minimumDzd: number;
  readonly fulfilment: { kind: "pickup" } | { kind: "delivery"; feeDzd: number };
};

function snapshotLine({ item, groups, optionIds, quantity, note }: QuoteLine, index: number) {
  const selected = new Set(optionIds);
  if (selected.size !== optionIds.length) return fail("invalid_options");

  const selections = groups.map((group) => ({
    optionGroupId: group.optionGroupId,
    optionIds: group.options
      .filter(({ optionId }) => selected.delete(optionId))
      .map(({ optionId }) => optionId),
  }));
  if (selected.size > 0) return fail("invalid_options");

  return configureCartLine({
    lineId: String(index + 1),
    item,
    optionGroups: groups,
    selections,
    quantity,
    note: note ?? "",
  });
}

export function priceCashQuote({ lines, minimumDzd, fulfilment }: QuoteInput) {
  const minimum = dzd(minimumDzd);
  if (!minimum.ok) return minimum;
  const fee = dzd(fulfilment.kind === "delivery" ? fulfilment.feeDzd : 0);
  if (!fee.ok) return fee;

  const snapshots: CartLine[] = [];
  for (const [index, line] of lines.entries()) {
    const snapshot = snapshotLine(line, index);
    if (!snapshot.ok) return snapshot;
    snapshots.push(snapshot.value);
  }
  const amount = priceOrder({
    lines: snapshots.map(({ quantity, unitPriceDzd, options }) => ({
      quantity,
      unitPriceDzd,
      optionDeltasDzd: options.map(({ priceDeltaDzd }) => priceDeltaDzd),
    })),
    minimumDzd: minimum.value,
    fulfillment:
      fulfilment.kind === "delivery" ? { kind: "zone", feeDzd: fee.value } : { kind: "pickup" },
  });
  if (!amount.ok) return amount;
  // Quotes and order rows use PostgreSQL integer amounts.
  if (amount.value.totalDzd > 2_147_483_647) return fail("invalid_money");
  return { ok: true as const, value: { ...amount.value, lines: snapshots } };
}
