import { expect, test } from "vitest";
import { merchantOnboardingOutput } from "../src/merchant.ts";

const sessionId = "01932f18-3150-7c33-8a7a-53acfd343001";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343002";
const approved = {
  sessionId,
  merchantId,
  restaurantName: "مطعم تجريبي",
  steps: {
    profile: "complete",
    hours: "incomplete",
    menu: { itemsTowardMinimum: 0, requiredItems: 5 },
    deliveryZone: "unavailable",
    testOrder: "unavailable",
  },
  canGoLive: false,
};

test("[MER-02:contract] describes the checklist for an approved restaurant with incomplete setup", () => {
  expect(merchantOnboardingOutput.parse(approved)).toEqual(approved);
  expect(
    merchantOnboardingOutput.safeParse({
      ...approved,
      steps: { ...approved.steps, menu: { itemsTowardMinimum: 6, requiredItems: 5 } },
    }).success,
  ).toBe(false);
  expect(merchantOnboardingOutput.safeParse({ ...approved, sessionId: undefined }).success).toBe(
    false,
  );
});

test("[MER-02:contract] a complete current setup cannot go live before zone and test-order evidence", () => {
  const complete = {
    ...approved,
    steps: {
      ...approved.steps,
      hours: "complete",
      menu: { itemsTowardMinimum: 5, requiredItems: 5 },
    },
  };
  expect(merchantOnboardingOutput.parse(complete)).toEqual(complete);
  expect(merchantOnboardingOutput.safeParse({ ...complete, canGoLive: true }).success).toBe(false);
  expect(
    merchantOnboardingOutput.safeParse({
      ...complete,
      steps: { ...complete.steps, deliveryZone: "complete" },
    }).success,
  ).toBe(false);
});
