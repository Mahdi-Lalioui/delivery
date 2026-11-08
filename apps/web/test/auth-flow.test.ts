import { expect, test } from "vitest";
import {
  chooseOtpAttempt,
  chooseVerificationAttempt,
  getSignInPurpose,
  normalizeCode,
  secondsUntil,
} from "../src/auth/auth-flow";

test("[AUTH-05] only the exact admin URL purpose enables the admin flow", () => {
  expect(getSignInPurpose("admin")).toBe("admin_sign_in");
  for (const value of [undefined, "", "admin_sign_in", ["admin"], ["admin", "sign_in"]]) {
    expect(getSignInPurpose(value)).toBe("sign_in");
  }
});

test("[AUTH-02] keeps the idempotency key only while retrying the same normalized request", () => {
  const phone = "+213550123456";
  const first = chooseOtpAttempt({ phone, purpose: "sign_in" });

  expect(first.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(chooseOtpAttempt({ phone, purpose: "sign_in", previous: first })).toBe(first);
  expect(chooseOtpAttempt({ phone, purpose: "sign_in" }).idempotencyKey).not.toBe(
    first.idempotencyKey,
  );
  expect(
    chooseOtpAttempt({ phone: "+213650123456", purpose: "sign_in", previous: first })
      .idempotencyKey,
  ).not.toBe(first.idempotencyKey);
  expect(
    chooseOtpAttempt({ phone, purpose: "admin_sign_in", previous: first }).idempotencyKey,
  ).not.toBe(first.idempotencyKey);
});

test("[CUS-10] normalizes pasted SMS and authenticator digits without turning codes into numbers", () => {
  expect(normalizeCode(" ٠١٢-۳۴۵ ٦٧٨")).toBe("012345");
  expect(normalizeCode("a1 b2")).toBe("12");
  expect(normalizeCode("")).toBe("");
});

test("[CUS-10] rounds resend availability up to the server deadline without going negative", () => {
  const deadline = Date.parse("2026-11-07T12:00:45.000Z");
  expect(secondsUntil(deadline, deadline - 45_000)).toBe(45);
  expect(secondsUntil(deadline, deadline - 1)).toBe(1);
  expect(secondsUntil(deadline, deadline)).toBe(0);
  expect(secondsUntil(deadline, deadline + 1000)).toBe(0);
});

test("[AUTH-01] retains a verification key after uncertainty for the same challenge and code", () => {
  const input = { challengeId: "challenge-a", code: "123456" };
  const first = chooseVerificationAttempt({ ...input });
  expect(first.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(chooseVerificationAttempt({ ...input, previous: first })).toBe(first);
  expect(chooseVerificationAttempt({ ...input }).idempotencyKey).not.toBe(first.idempotencyKey);
  expect(
    chooseVerificationAttempt({ ...input, code: "654321", previous: first }).idempotencyKey,
  ).not.toBe(first.idempotencyKey);
  expect(
    chooseVerificationAttempt({ ...input, challengeId: "challenge-b", previous: first })
      .idempotencyKey,
  ).not.toBe(first.idempotencyKey);
});
