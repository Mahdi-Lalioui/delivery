import { afterEach, expect, test, vi } from "vitest";
import { requestPhoneCode, verifyAuthenticatorCode, verifyPhoneCode } from "../src/auth/auth-http";

const challengeId = "019d6abc-1234-7234-8234-123456789abc";
const secondChallengeId = "019d6abc-1234-7234-8234-123456789def";
const expiresAt = "2026-11-07T12:05:00.000Z";
const resendAt = "2026-11-07T12:00:45.000Z";
const verificationKey = "verification-request";
const request = {
  phone: "+213550123456",
  purpose: "sign_in",
  idempotencyKey: "first-request",
} as const;

afterEach(() => vi.unstubAllGlobals());

test("[CUS-10] requests the code with a same-origin JSON POST and returns server deadlines", async () => {
  const response = { challengeId, expiresAt, resendAt };
  const fetch = vi.fn().mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetch);

  await expect(requestPhoneCode(request)).resolves.toEqual({ ok: true, data: response });
  expect(fetch).toHaveBeenCalledWith("/v1/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone: request.phone, purpose: request.purpose }),
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "Content-Type": "application/json", "Idempotency-Key": request.idempotencyKey },
  });
});

test("[AUTH-05] verifies OTP and TOTP with web transport and exposes only challenge status", async () => {
  const otp = { status: "totp_required", challengeId: secondChallengeId, expiresInSeconds: 300 };
  const authenticated = { status: "authenticated", transport: "web" };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(otp))
    .mockResolvedValueOnce(Response.json(authenticated));
  vi.stubGlobal("fetch", fetch);

  await expect(
    verifyPhoneCode({ challengeId, code: "123456", idempotencyKey: verificationKey }),
  ).resolves.toEqual({
    ok: true,
    data: otp,
  });
  await expect(
    verifyAuthenticatorCode({
      challengeId: secondChallengeId,
      code: "654321",
      idempotencyKey: verificationKey,
    }),
  ).resolves.toEqual({ ok: true, data: authenticated });
  for (const [call, path, body] of [
    [1, "/v1/auth/otp/verify", { challengeId, code: "123456", transport: "web" }],
    [
      2,
      "/v1/auth/totp/verify",
      { challengeId: secondChallengeId, code: "654321", transport: "web" },
    ],
  ] as const) {
    expect(fetch).toHaveBeenNthCalledWith(
      call,
      path,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": verificationKey },
      }),
    );
  }
});

test.each([
  ["otp_invalid", "otpInvalid"],
  ["otp_expired", "otpExpired"],
  ["otp_locked", "otpLocked"],
  ["otp_consumed", "otpConsumed"],
  ["otp_rate_limited", "otpRateLimited"],
  ["totp_invalid", "totpInvalid"],
  ["totp_expired", "totpExpired"],
  ["totp_locked", "totpLocked"],
  ["totp_replayed", "totpReplayed"],
  ["totp_consumed", "totpConsumed"],
])("[CUS-10] maps API error %s to its own localized message", async (code, error) => {
  const status = code === "otp_rate_limited" ? 429 : 400;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          type: "https://example.test/problems/auth",
          title: "Server wording",
          status,
          code,
          requestId: "test",
        },
        { status },
      ),
    ),
  );
  const verify = code.startsWith("totp") ? verifyAuthenticatorCode : verifyPhoneCode;
  await expect(
    verify({ challengeId, code: "123456", idempotencyKey: verificationKey }),
  ).resolves.toEqual({
    ok: false,
    error,
    canRetrySameRequest: false,
  });
});

test("[AUTH-02] distinguishes an uncertain delivery from a definitive rejection", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Connection interrupted"))
    .mockResolvedValueOnce(Response.json({ challengeId: "invalid", expiresAt, resendAt }))
    .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));
  vi.stubGlobal("fetch", fetch);

  await expect(requestPhoneCode(request)).resolves.toEqual({
    ok: false,
    error: "networkError",
    canRetrySameRequest: true,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(requestPhoneCode(request)).resolves.toEqual({
      ok: false,
      error: "unexpectedError",
      canRetrySameRequest: true,
    });
  }
});

test("[AUTH-03] rejects a bearer-mode response for a web verification", async () => {
  const bearer = { status: "authenticated", transport: "bearer", token: "A".repeat(43) };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(bearer)));

  await expect(
    verifyPhoneCode({ challengeId, code: "123456", idempotencyKey: verificationKey }),
  ).resolves.toMatchObject({
    ok: false,
    error: "unexpectedError",
  });
});

test("[AUTH-02] treats failed SMS delivery as recoverable with the same request key", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          type: "https://example.test/problems/otp_delivery_unavailable",
          title: "SMS unavailable",
          status: 503,
          code: "otp_delivery_unavailable",
          requestId: "fixture",
        },
        { status: 503 },
      ),
    ),
  );

  await expect(requestPhoneCode(request)).resolves.toEqual({
    ok: false,
    error: "otpDeliveryUnavailable",
    canRetrySameRequest: true,
  });
});
