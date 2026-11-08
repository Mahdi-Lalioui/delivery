import { createCipheriv } from "node:crypto";
import { expect, test } from "vitest";
import { matchTotp, openTotpSecret, sealTotpSecret } from "../src/auth-totp.ts";

const secret = Buffer.from("12345678901234567890");
const key = new Uint8Array(32).fill(17);
const userId = "01932f18-3150-7c33-8a7a-53acfd343001";

test.each([
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
])("[AUTH-05:crypto] checks RFC 6238 SHA-1 six-digit vector at %i seconds", (seconds, code) => {
  expect(matchTotp({ secret, code, now: new Date(seconds * 1000) })).toBe(Math.floor(seconds / 30));
});

test("[AUTH-05:crypto] bounds the TOTP window and rejects malformed codes", () => {
  const now = new Date(30_000);
  expect(matchTotp({ secret, code: "755224", now })).toBe(0);
  expect(matchTotp({ secret, code: "359152", now })).toBe(2);
  expect(matchTotp({ secret, code: "969429", now })).toBeUndefined();
  expect(matchTotp({ secret, code: "35915", now })).toBeUndefined();
  expect(matchTotp({ secret, code: "٣٥٩١٥٢", now })).toBeUndefined();
  expect(matchTotp({ secret, code: "359152", now: new Date(Number.NaN) })).toBeUndefined();
  expect(matchTotp({ secret, code: "755224", now: new Date(0) })).toBe(0);
});

test("[AUTH-05:crypto] encrypts TOTP seeds with independent nonces and binds them to an admin", () => {
  const sealed = sealTotpSecret({ key, userId, secret });
  expect(sealed).not.toEqual(secret);
  expect(sealTotpSecret({ key, userId, secret })).not.toEqual(sealed);
  expect(openTotpSecret({ key, userId, sealed })).toEqual(secret);
  expect(openTotpSecret({ key, userId: "another-user", sealed })).toBeUndefined();
  expect(openTotpSecret({ key: new Uint8Array(32), userId, sealed })).toBeUndefined();
  expect(openTotpSecret({ key, userId, sealed: sealed.subarray(0, 20) })).toBeUndefined();
  const tampered = Buffer.from(sealed);
  tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 1, tampered.length - 1);
  expect(openTotpSecret({ key, userId, sealed: tampered })).toBeUndefined();
});

test("[AUTH-05:crypto] rejects TOTP secrets shorter than 128 bits", () => {
  const weak = Buffer.alloc(1);
  expect(matchTotp({ secret: weak, code: "812658", now: new Date(30_000) })).toBeUndefined();
  expect(() => sealTotpSecret({ key, userId, secret: weak })).toThrow(RangeError);

  const nonce = Buffer.alloc(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(weak), cipher.final()]);
  const weakEnvelope = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  expect(openTotpSecret({ key, userId, sealed: weakEnvelope })).toBeUndefined();

  const minimum = Buffer.alloc(16, 9);
  const sealed = sealTotpSecret({ key, userId, secret: minimum });
  expect(openTotpSecret({ key, userId, sealed })).toEqual(minimum);
});
