import { prohibitedCategory } from "@zaafran/contracts/admin-moderation";
import { prohibitedCategories } from "@zaafran/domain/moderation";
import { expect, test } from "vitest";

test("[ADM-04:contract] the queue contract lists exactly the categories the domain screen reports", () => {
  expect(prohibitedCategory.options).toEqual([...prohibitedCategories]);
});
