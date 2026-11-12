import { expect, test, vi } from "vitest";
import { createPrivacyService } from "../src/privacy-service.ts";

const now = new Date("2026-11-09T12:00:00Z");
const userId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const identity = { userId, sessionId };
type Repository = Parameters<typeof createPrivacyService>[0]["repository"];

function setup() {
  const repository = {
    issueDeletionChallenge: vi.fn<Repository["issueDeletionChallenge"]>(),
    deliverDeletionChallenge: vi.fn<Repository["deliverDeletionChallenge"]>(),
    deleteAccount: vi.fn<Repository["deleteAccount"]>(),
    replayDeletion: vi.fn<Repository["replayDeletion"]>(),
    exportAccount: vi.fn<Repository["exportAccount"]>(),
  };
  const sendSms = vi.fn<Parameters<typeof createPrivacyService>[0]["sendSms"]>();
  const service = createPrivacyService({
    repository,
    sendSms,
    otpKey: Buffer.alloc(32, 7),
    now: () => now,
  });
  return { repository, sendSms, service };
}

test("[CUS-24] rate-limited issuance never sends SMS", async () => {
  const { repository, service, sendSms } = setup();
  repository.issueDeletionChallenge.mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
  expect(
    await service.issue({ ...identity, requestIp: "192.0.2.1", idempotencyKey: "fixture" }),
  ).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
  expect(repository.deliverDeletionChallenge).not.toHaveBeenCalled();
  expect(sendSms).not.toHaveBeenCalled();
});

test("[CUS-24] confirmation normalizes the challenge UUID and binds the digest to the account call", async () => {
  const { repository, service } = setup();
  repository.deleteAccount.mockResolvedValue("invalid_code");
  const challengeId = "01932f18-3150-7c33-8a7a-53acfd343003";
  await expect(
    service.confirm({ ...identity, challengeId: challengeId.toUpperCase(), code: "123456" }),
  ).resolves.toBe("invalid_code");
  await expect(service.confirm({ ...identity, challengeId, code: "123456" })).resolves.toBe(
    "invalid_code",
  );
  const [first, second] = repository.deleteAccount.mock.calls;
  expect(first?.[0]).toEqual(second?.[0]);
  expect(first?.[0]).toMatchObject({ ...identity, challengeId, now });
  expect(first?.[0].codeHmac).toHaveLength(32);
  expect(first?.[0]).not.toHaveProperty("code");
});

test("[CUS-24] resends the same pending delivery with a stable provider key after failure", async () => {
  const { repository, service, sendSms } = setup();
  const challengeId = "01932f18-3150-7c33-8a7a-53acfd343003";
  const expiresAt = new Date("2026-11-09T12:05:00Z");
  const phoneE164 = "+213500000000";
  repository.issueDeletionChallenge.mockResolvedValue({
    kind: "issued",
    challengeId,
    expiresAt,
    phoneE164,
    needsDelivery: true,
  });
  repository.deliverDeletionChallenge.mockImplementation(async ({ send }) => {
    await send({ phoneE164 });
    return true;
  });
  sendSms
    .mockRejectedValueOnce(new Error("Synthetic adapter failure"))
    .mockResolvedValueOnce(undefined);
  const input = { ...identity, requestIp: "192.0.2.1", idempotencyKey: "fixture" };
  await expect(service.issue(input)).resolves.toEqual({ kind: "delivery_unavailable" });
  await expect(service.issue(input)).resolves.toMatchObject({
    kind: "issued",
    challengeId,
    expiresAt,
  });
  const [first, second] = sendSms.mock.calls;
  expect(first?.[0]).toEqual(second?.[0]);
  expect(first?.[0]).toMatchObject({
    phone: phoneE164,
    deliveryKey: "account-delete:" + challengeId,
  });
  expect(first?.[0].code).toMatch(/^[0-9]{6}$/u);
});
