import { expect, test } from "vitest";
import {
  clearSessionCookie,
  hasSameOrigin,
  isNativeTransport,
  readSessionCredential,
  sessionCookie,
} from "../src/auth-transport.ts";

const origin = "https://zaafran.test";
const token = "A".repeat(43);

test("[AUTH-03:transport] reads exactly one cookie or Bearer credential", () => {
  expect(readSessionCredential({ cookie: `a=1; __Host-session=${token}; b=2` })).toEqual({
    transport: "web",
    token,
  });
  expect(readSessionCredential({ authorization: `Bearer ${token}` })).toEqual({
    transport: "bearer",
    token,
  });
  expect(readSessionCredential({ authorization: `bearer ${token}` })).toEqual({
    transport: "bearer",
    token,
  });
  expect(readSessionCredential({ cookie: `session=${token}` })).toBeUndefined();
});

test("[AUTH-03:transport] rejects duplicate, mixed and malformed credentials", () => {
  expect(
    readSessionCredential({ cookie: `__Host-session=${token}; __Host-session=${token}` }),
  ).toBeUndefined();
  expect(
    readSessionCredential({ cookie: `__Host-session=${token}`, authorization: `Bearer ${token}` }),
  ).toBeUndefined();
  expect(readSessionCredential({ authorization: `Bearer ${token}` }, 2)).toBeUndefined();
  expect(
    readSessionCredential({ authorization: `Bearer ${token}, Bearer ${token}` }),
  ).toBeUndefined();
  expect(readSessionCredential({ authorization: `Basic ${token}` })).toBeUndefined();
  expect(readSessionCredential({ cookie: "__Host-session=" })).toBeUndefined();
});

test("[AUTH-04:transport] cookie mutations require the configured origin", () => {
  expect(hasSameOrigin({ origin, "sec-fetch-site": "same-origin" }, origin)).toBe(true);
  expect(hasSameOrigin({ origin }, origin)).toBe(true);
  for (const fetchSite of ["same-site", "cross-site", "none"]) {
    expect(hasSameOrigin({ origin, "sec-fetch-site": fetchSite }, origin)).toBe(false);
  }
  expect(hasSameOrigin({}, origin)).toBe(false);
  expect(
    hasSameOrigin({ origin: "https://other.test", "sec-fetch-site": "same-origin" }, origin),
  ).toBe(false);
});

test("[AUTH-04:transport] bearer issuance accepts native requests without browser metadata", () => {
  expect(isNativeTransport({})).toBe(true);
  expect(isNativeTransport({ origin })).toBe(false);
  expect(isNativeTransport({ "sec-fetch-site": "same-origin" })).toBe(false);
});

test("[AUTH-03:transport] sets and clears an origin-bound cookie", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const expiresAt = new Date("2026-11-08T12:00:00Z");
  expect(sessionCookie({ token, now, expiresAt })).toBe(
    `__Host-session=${token}; Path=/; Max-Age=86400; Secure; HttpOnly; SameSite=Lax`,
  );
  expect(clearSessionCookie).toBe(
    "__Host-session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
  );
});
