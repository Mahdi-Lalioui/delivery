import { configureCartLine, type CartSelection } from "@zaafran/domain/cart";
import { dzd } from "@zaafran/domain/money";
import { priceOrder } from "@zaafran/domain/pricing";
import type { RestaurantGroup, RestaurantItem } from "./restaurant-types";

export interface ItemDraft {
  readonly quantity: number;
  readonly note: string;
  readonly selections: readonly CartSelection[];
}

export function createItemDraft(detail: RestaurantItem): ItemDraft {
  return {
    quantity: 1,
    note: "",
    selections: detail.optionGroups.map((group) => ({
      optionGroupId: group.optionGroupId,
      optionIds: group.options
        .filter((option) => option.isAvailable && option.isDefault)
        .map((option) => option.optionId)
        .slice(0, group.maximum),
    })),
  };
}

export function toggleItemOption(input: {
  readonly draft: ItemDraft;
  readonly group: RestaurantGroup;
  readonly optionId: string;
}): ItemDraft {
  const { draft, group, optionId } = input;
  if (!group.options.some((option) => option.optionId === optionId && option.isAvailable))
    return draft;
  const current =
    draft.selections.find((selection) => selection.optionGroupId === group.optionGroupId)
      ?.optionIds ?? [];
  let optionIds: readonly string[];
  if (group.maximum === 1) optionIds = [optionId];
  else if (current.includes(optionId)) optionIds = current.filter((id) => id !== optionId);
  else if (current.length >= group.maximum) return draft;
  else optionIds = [...current, optionId];
  return {
    ...draft,
    selections: draft.selections.map((selection) =>
      selection.optionGroupId === group.optionGroupId ? { ...selection, optionIds } : selection,
    ),
  };
}

export function prepareItemLine(detail: RestaurantItem, draft: ItemDraft, lineId: string) {
  return configureCartLine({
    lineId,
    item: detail.item,
    optionGroups: detail.optionGroups,
    ...draft,
  });
}

export function getDraftTotalDzd(detail: RestaurantItem, draft: ItemDraft): number | null {
  const unitPrice = dzd(detail.item.priceDzd);
  const minimum = dzd(0);
  if (!unitPrice.ok || !minimum.ok) return null;
  const deltas = detail.optionGroups.flatMap((group) => {
    const selected =
      draft.selections.find((selection) => selection.optionGroupId === group.optionGroupId)
        ?.optionIds ?? [];
    return group.options
      .filter((option) => selected.includes(option.optionId))
      .map((option) => option.priceDeltaDzd);
  });
  const price = priceOrder({
    lines: [{ unitPriceDzd: unitPrice.value, quantity: draft.quantity, optionDeltasDzd: deltas }],
    minimumDzd: minimum.value,
    fulfillment: { kind: "pickup" },
  });
  return price.ok ? price.value.totalDzd : null;
}
