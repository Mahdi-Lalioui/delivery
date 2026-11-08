import { dzd } from "@zaafran/domain/money";
import { priceOrder } from "@zaafran/domain/pricing";
import { merchantPromotionInput } from "@zaafran/contracts/promotions";

// MER-19 promotion editor logic: form draft → contract input, plus the worked example.

export type PromotionInput = ReturnType<typeof merchantPromotionInput.parse>;
type Discount = PromotionInput["discount"];
export type PromotionDraft = {
  activation: "code" | "automatic";
  code: string;
  discountKind: Discount["kind"];
  percent: string;
  capDzd: string;
  amountDzd: string;
  minimumSubtotalDzd: string;
  startsOn: string;
  endsOn: string;
  isFirstOrderOnly: boolean;
  maxUsesTotal: string;
  maxUsesPerCustomer: string;
};
export type DraftResult =
  { kind: "ready"; input: PromotionInput } | { kind: "invalid"; field: string };
export type WorkedExample = {
  subtotalDzd: number;
  discountDzd: number;
  deliveryFeeDzd: number;
  totalDzd: number;
};

export const emptyPromotionDraft: PromotionDraft = {
  activation: "automatic",
  code: "",
  discountKind: "percent",
  percent: "",
  capDzd: "",
  amountDzd: "",
  minimumSubtotalDzd: "",
  startsOn: "",
  endsOn: "",
  isFirstOrderOnly: false,
  maxUsesTotal: "",
  maxUsesPerCustomer: "",
};

const exampleSubtotalDzd = 2000;
const exampleDeliveryDzd = 250;

/** A whole number, or NaN so the contract rejects it; blanks stay undefined. */
function whole(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Percent with up to two decimals → basis points, without float drift. */
function basisPoints(value: string): number {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (match === null) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

function discountOf(draft: PromotionDraft): unknown {
  if (draft.discountKind === "free_delivery") return { kind: "free_delivery" };
  if (draft.discountKind === "fixed") return { kind: "fixed", amountDzd: whole(draft.amountDzd) };
  return { kind: "percent", basisPoints: basisPoints(draft.percent), capDzd: whole(draft.capDzd) };
}

function conditionsOf(draft: PromotionDraft): Record<string, unknown> {
  const entries: [string, unknown][] = [
    ["minimumSubtotalDzd", whole(draft.minimumSubtotalDzd)],
    ["startsOn", draft.startsOn === "" ? undefined : draft.startsOn],
    ["endsOn", draft.endsOn === "" ? undefined : draft.endsOn],
    ["firstOrderOnly", draft.isFirstOrderOnly ? true : undefined],
    ["maxUsesTotal", whole(draft.maxUsesTotal)],
    ["maxUsesPerCustomer", whole(draft.maxUsesPerCustomer)],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

const fieldNames: Readonly<Record<string, string>> = { basisPoints: "percent" };

export function promotionDraftToInput(draft: PromotionDraft): DraftResult {
  const activation =
    draft.activation === "code" ? { kind: "code", code: draft.code.trim() } : { kind: "automatic" };
  const parsed = merchantPromotionInput.safeParse({
    activation,
    discount: discountOf(draft),
    conditions: conditionsOf(draft),
  });
  if (parsed.success) return { kind: "ready", input: parsed.data };
  const field = parsed.error.issues[0]?.path.at(-1);
  const name = typeof field === "string" ? field : "discount";
  return { kind: "invalid", field: fieldNames[name] ?? name };
}

type DomainPromo = NonNullable<Parameters<typeof priceOrder>[0]["promo"]>;

function toDomainPromo(discount: Discount): DomainPromo | undefined {
  if (discount.kind === "free_delivery") return discount;
  if (discount.kind === "fixed") {
    const amount = dzd(discount.amountDzd);
    return amount.ok ? { kind: "fixed", amountDzd: amount.value } : undefined;
  }
  const cap = dzd(discount.capDzd);
  return cap.ok
    ? { kind: "percent", basisPoints: discount.basisPoints, capDzd: cap.value }
    : undefined;
}

/** MER-19 worked example: a 2 000 DA order with a 250 DA delivery fee, priced by the domain. */
export function promotionWorkedExample(discount: Discount): WorkedExample | undefined {
  const unit = dzd(exampleSubtotalDzd);
  const zero = dzd(0);
  const base = dzd(exampleDeliveryDzd);
  const promo = toDomainPromo(discount);
  if (!unit.ok || !zero.ok || !base.ok || promo === undefined) return undefined;
  const price = priceOrder({
    lines: [{ quantity: 1, unitPriceDzd: unit.value, optionDeltasDzd: [] }],
    minimumDzd: zero.value,
    promo,
    fulfillment: { kind: "delivery", roadMeters: 0, baseDzd: base.value, perKmDzd: zero.value },
  });
  return price.ok ? { ...price.value } : undefined;
}
