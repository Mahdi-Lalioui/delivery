import { dzd, type Dzd } from "./money.ts";
import { priceOrder } from "./pricing.ts";
import { fail, type Result } from "./result.ts";

export type CartNames = Readonly<Partial<Record<"ar" | "fr" | "en", string | undefined>>>;
export interface CartItem {
  readonly itemId: string;
  readonly names: CartNames;
  readonly priceDzd: number;
  readonly isAvailable: boolean;
}
export interface CartOptionGroup {
  readonly optionGroupId: string;
  readonly names: CartNames;
  readonly minimum: number;
  readonly maximum: number;
  readonly options: readonly {
    readonly optionId: string;
    readonly names: CartNames;
    readonly priceDeltaDzd: number;
    readonly isAvailable: boolean;
  }[];
}
export interface CartSelection {
  readonly optionGroupId: string;
  readonly optionIds: readonly string[];
}
interface CartOption {
  readonly optionGroupId: string;
  readonly groupNames: CartNames;
  readonly optionId: string;
  readonly names: CartNames;
  readonly priceDeltaDzd: Dzd;
}
export interface CartLine {
  readonly lineId: string;
  readonly itemId: string;
  readonly names: CartNames;
  readonly unitPriceDzd: Dzd;
  readonly options: readonly CartOption[];
  readonly quantity: number;
  readonly note: string;
}
export interface CartMerchant {
  readonly merchantId: string;
  readonly name: string;
  readonly minimumDzd: number;
}
export interface Cart {
  readonly version: 1;
  readonly merchant: CartMerchant;
  readonly lines: readonly CartLine[];
  readonly expiresAt: number;
}
export type CartError = {
  readonly code:
    | "invalid_cart"
    | "invalid_quantity"
    | "invalid_note"
    | "invalid_options"
    | "invalid_money"
    | "item_unavailable"
    | "merchant_change_required"
    | "duplicate_line"
    | "line_not_found"
    | "cart_expired";
};

const lifetime = 7 * 24 * 60 * 60 * 1_000;
const isQuantity = (value: number) => Number.isInteger(value) && value >= 1 && value <= 20;
const isInstant = (value: number) => Number.isSafeInteger(value) && value >= 0;
const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function amount(lines: readonly CartLine[]): Result<Dzd, CartError> {
  const zero = dzd(0);
  if (!zero.ok) return zero;
  const result = priceOrder({
    lines: lines.map((line) => ({
      ...line,
      optionDeltasDzd: line.options.map((option) => option.priceDeltaDzd),
    })),
    minimumDzd: zero.value,
    fulfillment: { kind: "pickup" },
  });
  if (!result.ok)
    return fail(result.error.code === "invalid_money" ? "invalid_money" : "invalid_cart");
  return { ok: true, value: result.value.subtotalDzd };
}

function hasValidLimits(group: CartOptionGroup, ids: readonly string[]): boolean {
  return (
    Number.isInteger(group.minimum) &&
    Number.isInteger(group.maximum) &&
    group.minimum >= 0 &&
    group.maximum >= 1 &&
    group.minimum <= group.maximum &&
    group.maximum <= group.options.length &&
    ids.length >= group.minimum &&
    ids.length <= group.maximum &&
    new Set(ids).size === ids.length
  );
}

function selectGroup(
  group: CartOptionGroup,
  ids: readonly string[],
): Result<readonly CartOption[], CartError> {
  if (
    !hasValidLimits(group, ids) ||
    new Set(group.options.map((option) => option.optionId)).size !== group.options.length
  )
    return fail("invalid_options");
  const options: CartOption[] = [];
  for (const optionId of ids) {
    const option = group.options.find((candidate) => candidate.optionId === optionId);
    if (!option?.isAvailable) return fail("invalid_options");
    const delta = dzd(option.priceDeltaDzd);
    if (!delta.ok) return delta;
    options.push({
      optionGroupId: group.optionGroupId,
      groupNames: { ...group.names },
      optionId,
      names: { ...option.names },
      priceDeltaDzd: delta.value,
    });
  }
  return { ok: true, value: options };
}

function selectOptions(input: {
  readonly optionGroups: readonly CartOptionGroup[];
  readonly selections: readonly CartSelection[];
}): Result<readonly CartOption[], CartError> {
  const { optionGroups, selections } = input;
  const groupIds = new Set(optionGroups.map((group) => group.optionGroupId));
  if (
    groupIds.size !== optionGroups.length ||
    new Set(selections.map((selection) => selection.optionGroupId)).size !== selections.length ||
    selections.some((selection) => !groupIds.has(selection.optionGroupId))
  )
    return fail("invalid_options");
  const options: CartOption[] = [];
  for (const group of optionGroups) {
    const ids =
      selections.find((selection) => selection.optionGroupId === group.optionGroupId)?.optionIds ??
      [];
    const selected = selectGroup(group, ids);
    if (!selected.ok) return selected;
    options.push(...selected.value);
  }
  return { ok: true, value: options };
}

export function configureCartLine(input: {
  readonly lineId: string;
  readonly item: CartItem;
  readonly optionGroups: readonly CartOptionGroup[];
  readonly selections: readonly CartSelection[];
  readonly quantity: number;
  readonly note: string;
}): Result<CartLine, CartError> {
  if (!input.item.isAvailable) return fail("item_unavailable");
  if (!isQuantity(input.quantity)) return fail("invalid_quantity");
  if (input.note.length > 140) return fail("invalid_note");
  if (!isId(input.lineId) || !isId(input.item.itemId)) return fail("invalid_cart");
  const unitPrice = dzd(input.item.priceDzd);
  if (!unitPrice.ok) return unitPrice;
  const selected = selectOptions(input);
  if (!selected.ok) return selected;
  const line: CartLine = {
    lineId: input.lineId,
    itemId: input.item.itemId,
    names: { ...input.item.names },
    unitPriceDzd: unitPrice.value,
    options: selected.value,
    quantity: input.quantity,
    note: input.note,
  };
  const total = amount([line]);
  return total.ok ? { ok: true, value: line } : total;
}

export function getCartSummary(cart: Cart): Result<
  {
    readonly subtotalDzd: Dzd;
    readonly remainingMinimumDzd: Dzd;
    readonly itemCount: number;
  },
  CartError
> {
  const subtotal = amount(cart.lines);
  if (!subtotal.ok) return subtotal;
  const minimum = dzd(cart.merchant.minimumDzd);
  if (!minimum.ok) return minimum;
  const remaining = dzd(Math.max(0, minimum.value - subtotal.value));
  if (!remaining.ok) return remaining;
  const itemCount = cart.lines.reduce((count, line) => count + line.quantity, 0);
  if (!Number.isSafeInteger(itemCount)) return fail("invalid_cart");
  return {
    ok: true,
    value: { subtotalDzd: subtotal.value, remainingMinimumDzd: remaining.value, itemCount },
  };
}

function saveCart(input: {
  readonly merchant: CartMerchant;
  readonly lines: readonly CartLine[];
  readonly now: number;
}): Result<Cart, CartError> {
  const expiresAt = input.now + lifetime;
  if (
    !isInstant(input.now) ||
    !isInstant(expiresAt) ||
    !isId(input.merchant.merchantId) ||
    !isId(input.merchant.name)
  )
    return fail("invalid_cart");
  const cart: Cart = { version: 1, merchant: { ...input.merchant }, lines: input.lines, expiresAt };
  const summary = getCartSummary(cart);
  return summary.ok ? { ok: true, value: cart } : summary;
}

export function addCartLine(input: {
  readonly cart: Cart | null;
  readonly merchant: CartMerchant;
  readonly line: CartLine;
  readonly now: number;
  readonly confirmMerchantChange?: boolean;
}): Result<Cart, CartError> {
  const cart = input.cart && input.cart.expiresAt > input.now ? input.cart : null;
  const changesMerchant = cart !== null && cart.merchant.merchantId !== input.merchant.merchantId;
  if (changesMerchant && !input.confirmMerchantChange) return fail("merchant_change_required");
  const previous = changesMerchant ? [] : (cart?.lines ?? []);
  if (previous.some((line) => line.lineId === input.line.lineId)) return fail("duplicate_line");
  return saveCart({ merchant: input.merchant, lines: [...previous, input.line], now: input.now });
}

export function setCartQuantity(input: {
  readonly cart: Cart;
  readonly lineId: string;
  readonly quantity: number;
  readonly now: number;
}): Result<Cart, CartError> {
  if (!isQuantity(input.quantity)) return fail("invalid_quantity");
  if (input.cart.expiresAt <= input.now) return fail("cart_expired");
  if (!input.cart.lines.some((line) => line.lineId === input.lineId)) return fail("line_not_found");
  const lines = input.cart.lines.map((line) =>
    line.lineId === input.lineId ? { ...line, quantity: input.quantity } : line,
  );
  return saveCart({ merchant: input.cart.merchant, lines, now: input.now });
}

export function removeCartLine(input: {
  readonly cart: Cart;
  readonly lineId: string;
  readonly now: number;
}): Result<Cart | null, CartError> {
  if (!isInstant(input.now)) return fail("invalid_cart");
  if (input.cart.expiresAt <= input.now) return fail("cart_expired");
  const lines = input.cart.lines.filter((line) => line.lineId !== input.lineId);
  if (lines.length === input.cart.lines.length) return fail("line_not_found");
  return lines.length === 0
    ? { ok: true, value: null }
    : saveCart({ merchant: input.cart.merchant, lines, now: input.now });
}

function readNames(value: unknown): CartNames | undefined {
  if (!isRecord(value)) return undefined;
  const names: Partial<Record<"ar" | "fr" | "en", string>> = {};
  for (const locale of ["ar", "fr", "en"] as const) {
    const text = value[locale];
    if (text === undefined) continue;
    if (typeof text !== "string" || text.trim().length === 0 || text.length > 120) return undefined;
    names[locale] = text;
  }
  return Object.keys(names).length > 0 ? names : undefined;
}

function readOption(value: unknown): CartOption | undefined {
  if (
    !isRecord(value) ||
    !isId(value.optionId) ||
    !isId(value.optionGroupId) ||
    typeof value.priceDeltaDzd !== "number"
  )
    return undefined;
  const names = readNames(value.names);
  const groupNames = readNames(value.groupNames);
  const delta = dzd(value.priceDeltaDzd);
  return names && groupNames && delta.ok
    ? {
        optionId: value.optionId,
        optionGroupId: value.optionGroupId,
        names,
        groupNames,
        priceDeltaDzd: delta.value,
      }
    : undefined;
}

function isLineData(value: unknown): value is {
  readonly lineId: string;
  readonly itemId: string;
  readonly names: unknown;
  readonly unitPriceDzd: number;
  readonly quantity: number;
  readonly note: string;
  readonly options: unknown[];
} {
  return (
    isRecord(value) &&
    isId(value.lineId) &&
    isId(value.itemId) &&
    typeof value.unitPriceDzd === "number" &&
    typeof value.quantity === "number" &&
    isQuantity(value.quantity) &&
    typeof value.note === "string" &&
    value.note.length <= 140 &&
    Array.isArray(value.options)
  );
}

function readOptions(values: readonly unknown[]): readonly CartOption[] | undefined {
  const options: CartOption[] = [];
  for (const entry of values) {
    const option = readOption(entry);
    if (
      !option ||
      options.some(
        (other) =>
          other.optionGroupId === option.optionGroupId && other.optionId === option.optionId,
      )
    )
      return undefined;
    options.push(option);
  }
  return options;
}

function readLine(value: unknown): CartLine | undefined {
  if (!isLineData(value)) return undefined;
  const names = readNames(value.names);
  const price = dzd(value.unitPriceDzd);
  const options = readOptions(value.options);
  return names && price.ok && options
    ? {
        lineId: value.lineId,
        itemId: value.itemId,
        names,
        unitPriceDzd: price.value,
        options,
        quantity: value.quantity,
        note: value.note,
      }
    : undefined;
}

function readMerchant(value: unknown): CartMerchant | undefined {
  if (
    !isRecord(value) ||
    !isId(value.merchantId) ||
    !isId(value.name) ||
    typeof value.minimumDzd !== "number"
  )
    return undefined;
  return { merchantId: value.merchantId, name: value.name, minimumDzd: value.minimumDzd };
}

function isCartData(value: unknown): value is {
  readonly merchant: unknown;
  readonly expiresAt: number;
  readonly lines: unknown[];
} {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.expiresAt === "number" &&
    isInstant(value.expiresAt) &&
    Array.isArray(value.lines) &&
    value.lines.length > 0
  );
}

export function readPersistedCart(input: {
  readonly value: unknown;
  readonly now: number;
}): Result<Cart | null, CartError> {
  const { value, now } = input;
  if (!isInstant(now) || !isCartData(value) || value.expiresAt > now + lifetime)
    return fail("invalid_cart");
  const merchant = readMerchant(value.merchant);
  if (!merchant) return fail("invalid_cart");
  const lines: CartLine[] = [];
  for (const entry of value.lines) {
    const line = readLine(entry);
    if (!line || lines.some((other) => other.lineId === line.lineId)) return fail("invalid_cart");
    lines.push(line);
  }
  const cart: Cart = { version: 1, merchant, lines, expiresAt: value.expiresAt };
  const summary = getCartSummary(cart);
  if (!summary.ok) return fail("invalid_cart");
  return { ok: true, value: value.expiresAt <= now ? null : cart };
}
