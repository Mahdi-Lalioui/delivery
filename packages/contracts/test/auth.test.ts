import { expect, test } from "vitest";
import {
  idempotencyKeySchema,
  logoutInput,
  requestOtpInput,
  requestOtpOutput,
  sessionIdParams,
  sessionListOutput,
  verifyOtpInput,
  verifyOtpOutput,
  verifyTotpInput,
  verifyTotpOutput,
} from "../src/auth.ts";

const challengeId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const phone = "+213500000000";
const token = `${"A".repeat(40)}_-E`;

test("[M2-1] auth idempotency keys require bounded ASCII header values", () => {
  for (const valid of ["A", "Otp.Request_v2:Attempt-42", "z".repeat(128)]) {
    expect(idempotencyKeySchema.parse(valid)).toBe(valid);
  }
  for (const invalid of ["", "x".repeat(129), "contains space", "É", "hello\r\nother", "a/b", 17]) {
    expect(idempotencyKeySchema.safeParse(invalid).success, String(invalid)).toBe(false);
  }
});

test("[CUS-10:contract] accepts canonical Algerian mobiles and supported purposes", () => {
  const signIn = { phone, purpose: "sign_in" };
  const adminSignIn = { phone: "+213700000000", purpose: "admin_sign_in" };
  const alternatePrefix = { phone: "+213600000000", purpose: "sign_in" };

  expect(requestOtpInput.parse(signIn)).toEqual(signIn);
  expect(requestOtpInput.parse(adminSignIn)).toEqual(adminSignIn);
  expect(requestOtpInput.parse(alternatePrefix)).toEqual(alternatePrefix);
});

test("[CUS-10:contract] requires canonical E.164 at the API boundary", () => {
  for (const invalid of [
    "0500000000",
    "00213500000000",
    "+213200000000",
    "+212500000000",
    "+21350000000",
    "+2135000000000",
    "+2135 00000000",
    "+213٥٠٠٠٠٠٠٠٠",
  ]) {
    expect(requestOtpInput.safeParse({ phone: invalid, purpose: "sign_in" }).success, invalid).toBe(
      false,
    );
  }
});

test("[AUTH-01:contract] rejects unknown purposes and unexpected request fields", () => {
  expect(requestOtpInput.safeParse({ phone }).success).toBe(false);
  expect(requestOtpInput.safeParse({ phone, purpose: "reset" }).success).toBe(false);
  expect(requestOtpInput.safeParse({ phone, purpose: "sign_in", transport: "web" }).success).toBe(
    false,
  );
  expect(requestOtpInput.safeParse({ phone, purpose: "sign_in", role: "admin" }).success).toBe(
    false,
  );
});

test("[AUTH-01:contract] [AUTH-02:contract] exposes the original expiry and resend deadlines", () => {
  const challenge = {
    challengeId,
    expiresAt: "2026-11-07T12:05:00.000Z",
    resendAt: "2026-11-07T12:00:45.000Z",
  };

  expect(requestOtpOutput.parse(challenge)).toEqual(challenge);
  for (const invalid of [
    { ...challenge, challengeId: "invalid" },
    { ...challenge, expiresAt: "later" },
    { ...challenge, resendAt: "2026-11-07T13:00:45+01:00" },
    { challengeId, expiresInSeconds: 300, resendAfterSeconds: 45 },
    { ...challenge, accountExists: true },
    { ...challenge, code: "001234" },
  ]) {
    expect(requestOtpOutput.safeParse(invalid).success).toBe(false);
  }
});

const verificationInputs = [
  { name: "OTP", schema: verifyOtpInput },
  { name: "TOTP", schema: verifyTotpInput },
];

test.each(verificationInputs)(
  "[AUTH-01:contract] [AUTH-05:contract] verifies six ASCII digits for $name",
  ({ schema }) => {
    const input = { challengeId, code: "001234", transport: "web" };

    expect(schema.parse(input)).toEqual(input);
    for (const code of [
      123456,
      "12345",
      "1234567",
      "١٢٣٤٥٦",
      "۱۲۳۴۵۶",
      "１２３４５６",
      "123456\n",
    ]) {
      expect(schema.safeParse({ ...input, code }).success, String(code)).toBe(false);
    }
    expect(schema.safeParse({ ...input, challengeId: "not-a-uuid" }).success).toBe(false);
  },
);

test.each(verificationInputs)(
  "[AUTH-03:contract] $name verification requires a supported transport",
  ({ schema }) => {
    const challenge = { challengeId, code: "001234" };
    const bearer = { ...challenge, transport: "bearer" };

    expect(schema.parse(bearer)).toEqual(bearer);
    expect(schema.safeParse(challenge).success).toBe(false);
    expect(schema.safeParse({ ...challenge, transport: "cookie" }).success).toBe(false);
    expect(schema.safeParse({ ...bearer, merchantId: sessionId }).success).toBe(false);
  },
);

const verificationOutputs = [
  { name: "OTP", schema: verifyOtpOutput },
  { name: "TOTP", schema: verifyTotpOutput },
];

test.each(verificationOutputs)(
  "[AUTH-03:contract] $name sends the session token only in a bearer response",
  ({ schema }) => {
    const web = { status: "authenticated", transport: "web" };
    const bearer = { status: "authenticated", transport: "bearer", token };

    expect(schema.parse(web)).toEqual(web);
    expect(schema.parse(bearer)).toEqual(bearer);
    expect(schema.safeParse({ ...web, token }).success).toBe(false);
    expect(schema.safeParse({ status: "authenticated" }).success).toBe(false);
    expect(schema.safeParse({ status: "authenticated", transport: "bearer" }).success).toBe(false);
    expect(schema.safeParse({ ...bearer, role: "admin" }).success).toBe(false);
  },
);

test.each(verificationOutputs)(
  "[AUTH-03:contract] $name rejects non-base64url and incorrectly sized bearer tokens",
  ({ schema }) => {
    for (const invalid of [
      token.slice(1),
      `${token}A`,
      `${token.slice(1)}/`,
      `${token.slice(1)}=`,
      `${token.slice(0, -1)}B`,
    ]) {
      expect(
        schema.safeParse({ status: "authenticated", transport: "bearer", token: invalid }).success,
      ).toBe(false);
    }
  },
);

test("[AUTH-05:contract] only OTP verification can return an incomplete TOTP challenge", () => {
  const challenge = { status: "totp_required", challengeId, expiresInSeconds: 300 };

  expect(verifyOtpOutput.parse(challenge)).toEqual(challenge);
  expect(verifyTotpOutput.safeParse(challenge).success).toBe(false);
  expect(verifyOtpOutput.safeParse({ ...challenge, transport: "bearer", token }).success).toBe(
    false,
  );
  expect(verifyOtpOutput.safeParse({ ...challenge, challengeId: "invalid" }).success).toBe(false);
  expect(verifyOtpOutput.safeParse({ ...challenge, expiresInSeconds: 299 }).success).toBe(false);
});

test("[AUTH-03:contract] distinguishes current-session logout from revoking all sessions", () => {
  for (const scope of ["current", "all"]) {
    const command = { scope, expectedSessionId: sessionId };
    expect(logoutInput.parse(command)).toEqual(command);
  }
  expect(logoutInput.safeParse({ scope: "all" }).success).toBe(false);
  expect(logoutInput.safeParse({ scope: "all", expectedSessionId: "invalid" }).success).toBe(false);
  expect(logoutInput.safeParse({}).success).toBe(false);
  expect(logoutInput.safeParse({ scope: "other" }).success).toBe(false);
  expect(logoutInput.safeParse({ scope: "all", sessionId }).success).toBe(false);
  expect(sessionIdParams.parse({ sessionId })).toEqual({ sessionId });
  expect(sessionIdParams.safeParse({ sessionId: "invalid" }).success).toBe(false);
  expect(sessionIdParams.safeParse({ sessionId, userId: challengeId }).success).toBe(false);
});

test("[AUTH-03:contract] session lists expose device metadata without token material", () => {
  const session = {
    id: sessionId,
    createdAt: "2026-11-07T12:00:00.000Z",
    lastSeenAt: "2026-11-07T13:00:00.000Z",
    expiresAt: "2026-12-07T13:00:00.000Z",
    current: true,
    deviceName: "Test browser",
  };
  const sessions = [session, { ...session, id: challengeId, current: false, deviceName: null }];

  expect(sessionListOutput.parse({ sessions })).toEqual({ sessions });
  expect(sessionListOutput.parse({ sessions: [] })).toEqual({ sessions: [] });
  const longestDevice = { ...session, deviceName: "x".repeat(120) };
  expect(sessionListOutput.parse({ sessions: [longestDevice] })).toEqual({
    sessions: [longestDevice],
  });
  expect(sessionListOutput.safeParse({ sessions, token }).success).toBe(false);
  for (const invalid of [
    { ...session, id: "invalid" },
    { ...session, createdAt: "yesterday" },
    { ...session, lastSeenAt: "now" },
    { ...session, expiresAt: "tomorrow" },
    { ...session, expiresAt: "2026-12-07T13:00:00+01:00" },
    { ...session, current: "true" },
    { ...session, deviceName: 42 },
    { ...session, deviceName: "" },
    { ...session, deviceName: "x".repeat(121) },
    { ...session, token },
    { ...session, tokenHash: "hashed-token" },
  ]) {
    expect(sessionListOutput.safeParse({ sessions: [invalid] }).success).toBe(false);
  }
});
