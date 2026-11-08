import { expect, test } from "vitest";
import { draftToInput, settingsToDraft } from "../src/admin/billing/billing-settings-http";
import { basisPointsToPercent, percentToBasisPoints } from "../src/retention/basis-points";
import { billingSettingsDefaults } from "@zaafran/contracts/billing";

test("[BIL-04][MER-19] parses percent with dot or comma and at most two decimals", () => {
  expect(percentToBasisPoints("19")).toBe(1900);
  expect(percentToBasisPoints("19,5")).toBe(1950);
  expect(percentToBasisPoints("0.07")).toBe(7);
  expect(percentToBasisPoints("19.555")).toBeNaN();
  expect(percentToBasisPoints("19.")).toBeNaN();
  expect(percentToBasisPoints("1e2")).toBeNaN();
});

test("[BIL-04] formats basis points so the parser reads them back unchanged", () => {
  for (const basisPoints of [0, 7, 50, 1900, 1950, 1999, 10_000]) {
    expect(percentToBasisPoints(basisPointsToPercent(basisPoints))).toBe(basisPoints);
  }
});

test("[BIL-04] the settings form rejects a tax rate it would otherwise round", () => {
  const draft = { ...settingsToDraft(billingSettingsDefaults), reason: "x" };
  expect(draftToInput({ ...draft, taxRatePercent: "19,5" }).data?.settings.taxRateBasisPoints).toBe(
    1950,
  );
  expect(draftToInput({ ...draft, taxRatePercent: "19.555" }).success).toBe(false);
  expect(draftToInput({ ...draft, priceDzd: "5000.5" }).success).toBe(false);
});
