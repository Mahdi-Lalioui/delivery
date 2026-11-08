import { expect, test } from "vitest";
import { platformSettingValue, publicFlagsOutput } from "../src/admin-ops.ts";
import {
  customerFavouritesOutput,
  customerOrderReceiptOutput,
  orderRecipientInput,
} from "../src/retention.ts";
import { merchantPromotionListOutput } from "../src/promotions.ts";
import { ramadanTodayOutput, ramadanTodayQuery } from "../src/scheduling.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";

test("[MER-19:contract] serves an explicit bounded promotion list envelope", () => {
  const promotion = {
    promotionId: id,
    merchantId: id,
    activation: { kind: "automatic" },
    discount: { kind: "fixed", amountDzd: 50 },
    conditions: {},
    stats: { uses: 0, salesDzd: 0 },
  };
  const response = { sessionId: id, promotions: [promotion] };
  expect(merchantPromotionListOutput.parse(response)).toEqual(response);
  expect(merchantPromotionListOutput.safeParse([promotion]).success).toBe(false);
  expect(
    merchantPromotionListOutput.safeParse({ sessionId: id, promotions: Array(101).fill(promotion) })
      .success,
  ).toBe(false);
});

test("[HRS-03:contract] binds today's Maghrib to a commune and the Ramadan state", () => {
  expect(ramadanTodayQuery.parse({ communeId: id })).toEqual({ communeId: id });
  expect(ramadanTodayQuery.safeParse({ communeId: "invalid" }).success).toBe(false);
  expect(ramadanTodayOutput.parse({ isRamadan: false, maghribAt: null })).toEqual({
    isRamadan: false,
    maghribAt: null,
  });
  expect(ramadanTodayOutput.safeParse({ isRamadan: true, maghribAt: null }).success).toBe(false);
  expect(
    ramadanTodayOutput.safeParse({ isRamadan: true, maghribAt: "2027-02-10T17:22:00Z" }).success,
  ).toBe(true);
});

test("[ADM-08:contract] enforces typed platform values and publishes only client-safe flags", () => {
  expect(platformSettingValue.order_accept_timeout_seconds.parse(480)).toBe(480);
  expect(platformSettingValue.first_order_cash_cap_dzd.safeParse(2.5).success).toBe(false);
  const banner = { ar: "صيانة", fr: "Maintenance", en: "Maintenance" };
  expect(
    publicFlagsOutput.parse({ flags: { ramadan_mode: true }, maintenanceBanner: banner }),
  ).toEqual({ flags: { ramadan_mode: true }, maintenanceBanner: banner });
  expect(
    publicFlagsOutput.safeParse({
      flags: { ramadan_mode: true, subscription_online_payment: true },
      maintenanceBanner: null,
    }).success,
  ).toBe(false);
});

test("[CUS-15:contract] validates recipient privacy choices and Algerian E.164 numbers", () => {
  const recipient = {
    name: "Destinataire fictif",
    phoneE164: "+213550000001",
    shareTracking: false,
  };
  expect(orderRecipientInput.parse(recipient)).toEqual(recipient);
  expect(orderRecipientInput.safeParse({ ...recipient, phoneE164: "0550000001" }).success).toBe(
    false,
  );
  expect(orderRecipientInput.safeParse({ ...recipient, shareTracking: undefined }).success).toBe(
    false,
  );
});

test("[CUS-23:contract] returns public restaurant cards in the private favourites envelope", () => {
  const restaurant = {
    merchantId: id,
    name: "Table fictive",
    slug: "table-fictive",
    coverMediaId: null,
    isOpen: false,
  };
  expect(customerFavouritesOutput.parse({ restaurants: [restaurant] })).toEqual({
    restaurants: [restaurant],
  });
  expect(
    customerFavouritesOutput.safeParse({
      restaurants: [{ ...restaurant, ownerPhone: "+213550000001" }],
    }).success,
  ).toBe(false);
});

test("[CUS-21:contract] validates whole-DZD receipt totals against their recorded breakdown", () => {
  const receipt = {
    orderId: id,
    merchantId: id,
    restaurantName: "Table fictive",
    shortCode: "K7M-4QX",
    status: "delivered",
    fulfilment: "delivery",
    placedAt: "2026-11-08T12:00:00Z",
    subtotalDzd: 500,
    discountDzd: 50,
    deliveryFeeDzd: 100,
    totalDzd: 550,
    lines: [],
  };
  expect(customerOrderReceiptOutput.parse(receipt)).toEqual(receipt);
  expect(customerOrderReceiptOutput.safeParse({ ...receipt, totalDzd: 551 }).success).toBe(false);
});
