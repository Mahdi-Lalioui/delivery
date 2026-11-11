import { problemResponseSchema } from "@zaafran/contracts/health";
import { merchantProfilePhotosOutput } from "@zaafran/contracts/merchant";
import type { createMerchantProfilePhotosRepository } from "@zaafran/db/merchant-profile-photos";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMerchantProfilePhotosRepository>;

const now = new Date("2026-11-08T12:00:00Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const coverPhotoId = "01932f18-3150-7c33-8a7a-53acfd343004";
const logoPhotoId = "01932f18-3150-7c33-8a7a-53acfd343005";
const owner = { role: "merchant_owner", accountId, sessionId } as const;
const path = `/v1/merchants/${merchantId}/profile/photos`;
const input = { coverPhotoId, logoPhotoId, expectedRevision: 2 };
const headers = { "idempotency-key": "fixture-profile-photos", "x-expected-session-id": sessionId };
const write = { method: "PUT", url: path, headers, payload: input } as const;
const profile = { coverPhotoId, logoPhotoId, restaurantName: "Restaurant fictif", revision: 3 };

function setup(actor?: Actor) {
  const repository = { read: vi.fn<Repository["read"]>(), write: vi.fn<Repository["write"]>() };
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    merchantProfilePhotos: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-14:profile] reads a private profile snapshot and replays the exact write receipt", async () => {
  const { api, repository } = setup(owner);
  repository.read.mockResolvedValue(profile);
  repository.write.mockResolvedValue({ kind: "replayed", ...profile });
  const read = await api.inject(path);
  const saved = await api.inject(write);
  for (const response of [read, saved]) {
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(merchantProfilePhotosOutput.parse(response.json())).toEqual({ ...profile, sessionId });
  }
  expect(repository.read).toHaveBeenCalledExactlyOnceWith({ accountId, merchantId });
  expect(repository.write).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      accountId,
      merchantId,
      input,
      now,
    }),
  );
});

test("[MER-14:profile] rejects staff and stale session writes before persistence", async () => {
  const staff = setup({ ...owner, role: "merchant_staff" });
  expect((await staff.api.inject(path)).statusCode).toBe(403);
  expect((await staff.api.inject(write)).statusCode).toBe(403);
  expect(staff.repository.read).not.toHaveBeenCalled();
  expect(staff.repository.write).not.toHaveBeenCalled();

  const { api, repository } = setup(owner);
  const response = await api.inject({
    ...write,
    headers: { ...headers, "x-expected-session-id": accountId },
  });
  expect(response.statusCode).toBe(409);
  expect(problemResponseSchema.parse(response.json()).code).toBe("session_changed");
  expect(repository.write).not.toHaveBeenCalled();
});

test.each([
  ["not_found", 404],
  ["photos_unavailable", 409],
  ["revision_conflict", 409],
  ["idempotency_conflict", 409],
] as const)("[MER-14:profile] reports the scoped %s write failure", async (kind, status) => {
  const { api, repository } = setup(owner);
  repository.write.mockResolvedValue({ kind });
  const response = await api.inject(write);
  expect(response.statusCode).toBe(status);
  expect(problemResponseSchema.parse(response.json()).code).toBe(kind);
  expect(repository.write).toHaveBeenCalledOnce();
});
