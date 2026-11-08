import { expect, test } from "vitest";
import {
  emptyPromotionDraft,
  promotionDraftToInput,
  promotionWorkedExample,
} from "../src/retention/promotion-draft";

const base = emptyPromotionDraft;

test("[MER-19] builds a percent code promotion with a DZD cap and conditions", () => {
  const result = promotionDraftToInput({
    ...base,
    activation: "code",
    code: " RAMADAN10 ",
    discountKind: "percent",
    percent: "10",
    capDzd: "500",
    minimumSubtotalDzd: "1500",
    startsOn: "2027-02-08",
    endsOn: "2027-03-09",
    isFirstOrderOnly: true,
    maxUsesTotal: "200",
    maxUsesPerCustomer: "1",
  });
  expect(result).toEqual({
    kind: "ready",
    input: {
      activation: { kind: "code", code: "RAMADAN10" },
      discount: { kind: "percent", basisPoints: 1000, capDzd: 500 },
      conditions: {
        minimumSubtotalDzd: 1500,
        startsOn: "2027-02-08",
        endsOn: "2027-03-09",
        firstOrderOnly: true,
        maxUsesTotal: 200,
        maxUsesPerCustomer: 1,
      },
    },
  });
});

test("[MER-19] builds automatic fixed and free-delivery promotions without optional conditions", () => {
  expect(promotionDraftToInput({ ...base, discountKind: "fixed", amountDzd: "300" })).toEqual({
    kind: "ready",
    input: {
      activation: { kind: "automatic" },
      discount: { kind: "fixed", amountDzd: 300 },
      conditions: {},
    },
  });
  expect(promotionDraftToInput({ ...base, discountKind: "free_delivery" })).toMatchObject({
    kind: "ready",
    input: { discount: { kind: "free_delivery" } },
  });
});

test("[MER-19] reports the first invalid field", () => {
  expect(promotionDraftToInput({ ...base, activation: "code", code: "  " })).toEqual({
    kind: "invalid",
    field: "code",
  });
  expect(
    promotionDraftToInput({ ...base, discountKind: "percent", percent: "120", capDzd: "1" }),
  ).toEqual({ kind: "invalid", field: "percent" });
  expect(promotionDraftToInput({ ...base, discountKind: "fixed", amountDzd: "1.5" })).toEqual({
    kind: "invalid",
    field: "amountDzd",
  });
  expect(
    promotionDraftToInput({
      ...base,
      discountKind: "free_delivery",
      startsOn: "2027-03-01",
      endsOn: "2027-02-01",
    }),
  ).toEqual({ kind: "invalid", field: "endsOn" });
});

test("[MER-19] the worked example uses the real pricing rules", () => {
  const percent = { kind: "percent" as const, basisPoints: 1000, capDzd: 150 };
  expect(promotionWorkedExample(percent)).toEqual({
    subtotalDzd: 2000,
    discountDzd: 150,
    deliveryFeeDzd: 250,
    totalDzd: 2100,
  });
  expect(promotionWorkedExample({ kind: "fixed", amountDzd: 3000 })).toEqual({
    subtotalDzd: 2000,
    discountDzd: 2000,
    deliveryFeeDzd: 250,
    totalDzd: 250,
  });
  expect(promotionWorkedExample({ kind: "free_delivery" })).toEqual({
    subtotalDzd: 2000,
    discountDzd: 0,
    deliveryFeeDzd: 0,
    totalDzd: 2000,
  });
});
