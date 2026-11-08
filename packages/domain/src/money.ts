import { fail, type Result } from "./result.ts";

declare const currency: unique symbol;
export type Dzd = number & { readonly [currency]: "DZD" };
export type MoneyError = { readonly code: "invalid_money" };

export function dzd(value: number): Result<Dzd, MoneyError> {
  if (!Number.isSafeInteger(value) || value < 0) return fail("invalid_money");
  // The sole brand boundary accepts nonnegative whole DZD. Adding zero canonicalizes -0.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-type-assertion
  return { ok: true, value: (value + 0) as Dzd };
}
