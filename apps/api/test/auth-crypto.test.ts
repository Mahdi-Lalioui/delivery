import { expect, test } from "vitest";
import {
  createOtpCode,
  createSessionToken,
  hashOtp,
  hashSessionToken,
  matchesOtp,
} from "../src/auth-crypto.ts";

const challengeId = "01932f18-3150-7c33-8a7a-53acfd343001";
const key = new Uint8Array(32).fill(17);

test("[AUTH-01:crypto] derives six ASCII digits reproducibly for the same challenge", () => {
  const code = createOtpCode({ key, challengeId });
  const differentChallenge = createOtpCode({
    key,
    challengeId: "01932f18-3150-7c33-8a7a-53acfd343002",
  });

  expect(code).toMatch(/^[0-9]{6}$/);
  expect(createOtpCode({ key, challengeId })).toBe(code);
  expect(differentChallenge).toMatch(/^[0-9]{6}$/);
  expect(differentChallenge).not.toBe(code);
});

test("[AUTH-01:crypto] binds the stored OTP HMAC to the challenge and server key", () => {
  const digest = hashOtp({ key, challengeId, code: "001234" });
  expect(digest).toHaveLength(32);
  expect(digest).toEqual(hashOtp({ key, challengeId, code: "001234" }));
  expect(digest).not.toEqual(hashOtp({ key, challengeId, code: "001235" }));
  expect(digest).not.toEqual(hashOtp({ key, challengeId: "other-challenge", code: "001234" }));
  expect(digest).not.toEqual(hashOtp({ key: new Uint8Array(32), challengeId, code: "001234" }));
  expect(matchesOtp(digest, hashOtp({ key, challengeId, code: "001234" }))).toBe(true);
  expect(matchesOtp(digest, hashOtp({ key, challengeId, code: "001235" }))).toBe(false);
  expect(matchesOtp(digest, new Uint8Array(31))).toBe(false);
  expect(matchesOtp(new Uint8Array(31), new Uint8Array(31))).toBe(false);
});

test("[AUTH-03:crypto] issues canonical 256-bit tokens and exposes only hashes to persistence", () => {
  const { token, tokenHash } = createSessionToken();
  const bytes = Buffer.from(token, "base64url");
  expect(bytes).toHaveLength(32);
  expect(bytes.toString("base64url")).toBe(token);
  expect(tokenHash).toEqual(hashSessionToken(token));
  expect(tokenHash).not.toEqual(bytes);
  expect(createSessionToken().token).not.toBe(token);
  expect(hashSessionToken(`${"A".repeat(42)}B`)).toBeUndefined();
  expect(hashSessionToken(`${token}=`)).toBeUndefined();
});
