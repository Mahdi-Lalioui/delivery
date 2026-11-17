import { expect, test } from "vitest";
import { tenderSuggestions } from "../src/checkout/tender-suggestions";

test("[CUS-14] cash suggestions start with the exact total, then the notes people hand over", () => {
  expect(tenderSuggestions(3100)).toEqual([3100, 3500, 4000, 5000]);
  expect(tenderSuggestions(2000)).toEqual([2000, 2500, 3000, 4000]);
  expect(tenderSuggestions(950)).toEqual([950, 1000, 2000, 5000]);
});

test("[CUS-14] cash suggestions never go above the total plus 10 000 DA", () => {
  for (const total of [100, 4999, 9000, 48_750]) {
    for (const amount of tenderSuggestions(total)) {
      expect(amount).toBeGreaterThanOrEqual(total);
      expect(amount).toBeLessThanOrEqual(total + 10_000);
    }
  }
});
