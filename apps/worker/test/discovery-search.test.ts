import { expect, test, vi } from "vitest";
import { createSearchRefreshJob } from "../src/discovery-search.ts";

test("[SRCH-04:job] drains a bounded batch and lets failures retry after other merchants finish", async () => {
  const listPendingMerchants = vi
    .fn<(limit: number) => Promise<string[]>>()
    .mockResolvedValue(["first", "retry", "last"]);
  const refreshMerchant = vi.fn<(id: string) => Promise<void>>().mockResolvedValue();
  refreshMerchant.mockRejectedValueOnce(new Error("transient"));
  const run = createSearchRefreshJob({ listPendingMerchants, refreshMerchant });
  await expect(run()).rejects.toThrow(AggregateError);
  expect(listPendingMerchants).toHaveBeenCalledExactlyOnceWith(50);
  expect(refreshMerchant.mock.calls).toEqual([["first"], ["retry"], ["last"]]);
});
