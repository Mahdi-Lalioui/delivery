import { expect, test, vi } from "vitest";
import { createPrivacyMediaPurgeJob } from "../src/privacy-media.ts";

const userId = "01932f18-3150-7c33-8a7a-53acfd343001";
const mediaId = "01932f18-3150-7c33-8a7a-53acfd343002";

test("[CUS-24] deletes the objects before removing the erasure record and can retry failures", async () => {
  const keys = ["quarantine/photo.webp", "variants/photo.webp"];
  const findErasureMedia = vi
    .fn()
    .mockResolvedValueOnce([{ mediaId, keys }])
    .mockResolvedValueOnce([{ mediaId, keys }])
    .mockResolvedValueOnce([]);
  const finishErasureMedia = vi.fn().mockResolvedValue(undefined);
  const deleteObject = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Synthetic storage outage"))
    .mockResolvedValue(undefined);
  const job = createPrivacyMediaPurgeJob({
    repository: { findErasureMedia, finishErasureMedia },
    store: { delete: deleteObject },
  });
  await expect(job({ userId })).rejects.toThrow("Synthetic storage outage");
  expect(finishErasureMedia).not.toHaveBeenCalled();
  await job({ userId });
  expect(deleteObject.mock.calls).toEqual([...keys, ...keys].map((key) => [key]));
  expect(finishErasureMedia).toHaveBeenCalledExactlyOnceWith({ userId, mediaId });
  expect(findErasureMedia).toHaveBeenCalledTimes(3);
});
