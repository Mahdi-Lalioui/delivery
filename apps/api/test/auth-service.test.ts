import type { AuthRepository, AuthTransaction } from "@zaafran/db/auth";
import { expect, test, vi } from "vitest";
import { hashOtp, hashSessionToken } from "../src/auth-crypto.ts";
import { createAuthService } from "../src/auth-service.ts";
import { sealTotpSecret } from "../src/auth-totp.ts";

const now = new Date("2026-11-07T12:00:00.000Z");
const expiresAt = new Date("2026-11-07T12:05:00.000Z");
const resendAt = new Date("2026-11-07T12:00:45.000Z");
const challengeId = "01932f18-3150-7c33-8a7a-53acfd343001";
const user = {
  id: "01932f18-3150-7c33-8a7a-53acfd343002",
  phoneE164: "+213500000000",
  blockedAt: null,
  deletedAt: null,
};
const device = {
  id: "01932f18-3150-7c33-8a7a-53acfd343003",
  createdAt: now,
  lastSeenAt: now,
  expiresAt: new Date("2026-12-07T12:00:00.000Z"),
  deviceName: null,
};
const otpKey = new Uint8Array(32).fill(3);
const totpKey = new Uint8Array(32).fill(4);
const verification = {
  challengeId,
  idempotencyKey: "attempt-1",
  code: "001234",
  transport: "web",
  requestIp: "192.0.2.1",
  deviceName: "Test browser",
} as const;
const request = {
  phone: user.phoneE164,
  purpose: "sign_in",
  idempotencyKey: "fixture-attempt-1",
  requestIp: verification.requestIp,
} as const;

function fixture() {
  const transaction = {
    reserveOtpChallenge: vi
      .fn<AuthTransaction["reserveOtpChallenge"]>()
      .mockImplementation(({ id }) =>
        Promise.resolve({ kind: "created", challenge: { id, expiresAt, resendAt } }),
      ),
    redeemOtp: vi.fn<AuthTransaction["redeemOtp"]>().mockResolvedValue({
      kind: "verified",
      phoneE164: user.phoneE164,
      purpose: "sign_in",
    }),
    getOrCreateUserForSignIn: vi
      .fn<AuthTransaction["getOrCreateUserForSignIn"]>()
      .mockResolvedValue(user),
    lockUserByPhone: vi.fn<AuthTransaction["lockUserByPhone"]>().mockResolvedValue(user),
    insertAdminChallenge: vi.fn<AuthTransaction["insertAdminChallenge"]>().mockResolvedValue(true),
    redeemAdminChallenge: vi.fn<AuthTransaction["redeemAdminChallenge"]>().mockResolvedValue({
      kind: "verified",
      userId: user.id,
    }),
    insertSession: vi.fn<AuthTransaction["insertSession"]>().mockResolvedValue(device),
    revokeSessions: vi.fn<AuthTransaction["revokeSessions"]>().mockResolvedValue(1),
  };
  const repository = {
    transaction: <Result>(run: (tx: AuthTransaction) => Promise<Result>) => run(transaction),
    deliverOtp: vi.fn<AuthRepository["deliverOtp"]>().mockImplementation(async ({ send }) => {
      await send();
      return true;
    }),
    resolveSession: vi.fn<AuthRepository["resolveSession"]>().mockResolvedValue(undefined),
    listSessions: vi.fn<AuthRepository["listSessions"]>().mockResolvedValue([device]),
  };
  const sendSms = vi
    .fn<Parameters<typeof createAuthService>[0]["sendSms"]>()
    .mockResolvedValue(undefined);
  const service = createAuthService({ repository, otpKey, totpKey, now: () => now, sendSms });
  return { service, repository, transaction, sendSms };
}

test("[AUTH-01:service] reserves an HMAC and sends the six-digit value only to SMS", async () => {
  const { service, transaction, sendSms } = fixture();
  const result = await service.requestOtp(request);
  const message = sendSms.mock.calls[0]?.[0];
  const stored = transaction.reserveOtpChallenge.mock.calls[0]?.[0];
  expect(message?.phone).toBe(user.phoneE164);
  expect(message?.code).toMatch(/^[0-9]{6}$/);
  if (!stored || !message) throw new Error("Missing reserve or SMS invocation");
  expect(result).toEqual({
    ok: true,
    value: {
      challengeId: stored.id,
      expiresAt: expiresAt.toISOString(),
      resendAt: resendAt.toISOString(),
    },
  });
  expect(message.deliveryKey).toBe(stored.id);
  expect(stored.codeHmac).toEqual(
    hashOtp({ key: otpKey, challengeId: stored.id, code: message.code }),
  );
  expect(stored).not.toHaveProperty("code");
  expect(stored).not.toHaveProperty("idempotencyKey");
  expect(stored.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-7/);
});

test("[AUTH-02:service] replays original deadlines without sending a second SMS", async () => {
  const { service, repository, transaction, sendSms } = fixture();
  const original = await service.requestOtp(request);
  if (!original.ok) throw new Error("Expected a reserved challenge");
  transaction.reserveOtpChallenge.mockResolvedValueOnce({
    kind: "replayed",
    challenge: { id: original.value.challengeId, expiresAt, resendAt },
  });
  repository.deliverOtp.mockResolvedValueOnce(true);
  expect(await service.requestOtp(request)).toEqual(original);
  expect(sendSms).toHaveBeenCalledTimes(1);
});

test("[AUTH-02:service] retrying a failed SMS delivery sends the original challenge and code", async () => {
  const { service, repository, transaction, sendSms } = fixture();
  sendSms.mockRejectedValueOnce(new Error("Fixture SMS provider unavailable"));
  expect(await service.requestOtp(request)).toEqual({
    ok: false,
    code: "otp_delivery_unavailable",
  });

  const stored = transaction.reserveOtpChallenge.mock.calls[0]?.[0];
  const first = sendSms.mock.calls[0]?.[0];
  if (!stored || !first) throw new Error("Expected a reserved challenge and an SMS attempt");
  expect(first.code).toMatch(/^[0-9]{6}$/);
  expect(first.deliveryKey).toBe(stored.id);
  transaction.reserveOtpChallenge.mockResolvedValueOnce({
    kind: "replayed",
    challenge: { id: stored.id, expiresAt, resendAt },
  });

  expect(await service.requestOtp(request)).toEqual({
    ok: true,
    value: {
      challengeId: stored.id,
      expiresAt: expiresAt.toISOString(),
      resendAt: resendAt.toISOString(),
    },
  });
  expect(sendSms).toHaveBeenCalledTimes(2);
  expect(sendSms).toHaveBeenNthCalledWith(2, first);
  expect(repository.deliverOtp.mock.calls.map(([delivery]) => delivery.id)).toEqual([
    stored.id,
    stored.id,
  ]);
  expect(transaction.reserveOtpChallenge.mock.calls[1]?.[0].idempotencyKeyHash).toEqual(
    stored.idempotencyKeyHash,
  );
});

test("[AUTH-02:service] reports quota timing and key conflicts without sending", async () => {
  const { service, transaction, sendSms } = fixture();
  transaction.reserveOtpChallenge.mockResolvedValueOnce({
    kind: "rate_limited",
    retryAt: new Date(now.getTime() + 20_001),
  });
  expect(await service.requestOtp(request)).toEqual({
    ok: false,
    code: "otp_rate_limited",
    retryAfterSeconds: 21,
  });
  transaction.reserveOtpChallenge.mockResolvedValueOnce({ kind: "conflict" });
  expect(await service.requestOtp(request)).toEqual({ ok: false, code: "idempotency_conflict" });
  expect(sendSms).not.toHaveBeenCalled();
});

test.each([
  ["invalid", "otp_invalid"],
  ["expired", "otp_expired"],
  ["locked", "otp_locked"],
  ["consumed", "otp_consumed"],
] as const)("[CUS-10:service] reports a rejected OTP as %s", async (kind, code) => {
  const { service, transaction } = fixture();
  transaction.redeemOtp.mockResolvedValueOnce({ kind });
  expect(await service.verifyOtp(verification)).toEqual({ ok: false, code });
  expect(transaction.insertSession).not.toHaveBeenCalled();
});

test("[AUTH-03:service] passes only the token digest to session persistence", async () => {
  const { service, transaction } = fixture();
  const result = await service.verifyOtp(verification);
  if (!result.ok || result.value.kind !== "session") throw new Error("Expected a session");
  expect(result.value).toMatchObject({ transport: "web", session: device, now });
  expect(transaction.insertSession).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: user.id,
      tokenHash: hashSessionToken(result.value.token),
      kind: "standard",
      transport: "web",
    }),
  );
  expect(transaction.insertSession.mock.calls[0]?.[0]).not.toHaveProperty("token");
  const verificationCall = transaction.redeemOtp.mock.calls[0]?.[0];
  expect(
    verificationCall?.matchesCode(hashOtp({ key: otpKey, challengeId, code: verification.code })),
  ).toBe(true);
});

test("[AUTH-05:service] requires TOTP before issuing an admin session", async () => {
  const { service, transaction } = fixture();
  transaction.redeemOtp.mockResolvedValue({
    kind: "verified",
    phoneE164: user.phoneE164,
    purpose: "admin_sign_in",
  });
  const pending = await service.verifyOtp({ ...verification, transport: "bearer" });
  if (!pending.ok || pending.value.kind !== "totp_required") throw new Error("Expected TOTP");
  expect(transaction.insertAdminChallenge).toHaveBeenCalledWith(
    expect.objectContaining({
      id: pending.value.challengeId,
      userId: user.id,
      otpChallengeId: challengeId,
      transport: "bearer",
    }),
  );
  expect(transaction.insertSession).not.toHaveBeenCalled();
  transaction.insertAdminChallenge.mockResolvedValueOnce(false);
  expect(await service.verifyOtp(verification)).toEqual({ ok: false, code: "otp_invalid" });
  const result = await service.verifyTotp({
    ...verification,
    challengeId: pending.value.challengeId,
    transport: "bearer",
  });
  expect(result).toMatchObject({ ok: true, value: { kind: "session", transport: "bearer" } });
  expect(transaction.insertSession).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "admin", transport: "bearer" }),
  );
});

test("[AUTH-05:service] authenticates a persisted TOTP seed bound to its admin", async () => {
  const { service, transaction } = fixture();
  const sealed = sealTotpSecret({
    key: totpKey,
    userId: user.id,
    secret: Buffer.from("12345678901234567890"),
  });
  await service.verifyTotp(verification);
  const admin = transaction.redeemAdminChallenge.mock.calls[0]?.[0];
  expect(admin?.matchTotp(sealed, "wrong-id")).toBeUndefined();
  expect(admin?.matchTotp(sealed, user.id)).toBeUndefined();
  transaction.redeemAdminChallenge.mockResolvedValueOnce({ kind: "replayed" });
  expect(await service.verifyTotp(verification)).toEqual({ ok: false, code: "totp_replayed" });
});

test("[AUTH-03:service] lists and revokes device sessions within the resolved account", async () => {
  const { service, repository, transaction } = fixture();
  const credential = { token: "A".repeat(43), transport: "web" } as const;
  const current = { ...device, userId: user.id, transport: "web", kind: "standard" } as const;
  repository.resolveSession.mockResolvedValueOnce(current);
  expect(await service.resolveSession(credential)).toEqual(current);
  expect(repository.resolveSession).toHaveBeenCalledWith({
    transport: "web",
    tokenHash: hashSessionToken(credential.token),
    now,
  });
  expect(await service.resolveSession({ ...credential, token: "invalid" })).toBeUndefined();
  expect(repository.resolveSession).toHaveBeenCalledTimes(1);
  expect(await service.listSessions(current)).toEqual({
    sessions: [
      {
        ...device,
        current: true,
        createdAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: device.expiresAt.toISOString(),
      },
    ],
  });
  expect(await service.revokeSessions(current, { kind: "all" })).toBe(1);
  expect(transaction.revokeSessions).toHaveBeenCalledWith({
    userId: user.id,
    scope: { kind: "all" },
    now,
  });
});
