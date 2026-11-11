import { expect, test } from "vitest";
import { readApiEnvironment } from "../src/environment.ts";

test("[M0-6] validates the database URL, listener and port at startup", () => {
  const input = {
    DATABASE_URL: "postgresql://zaafran:fixture@127.0.0.1:5432/zaafran_test",
    API_HOST: "127.0.0.1",
    API_PORT: "8081",
    AUTH_PUBLIC_ORIGIN: "https://zaafran.test",
    AUTH_OTP_KEY: "01".repeat(32),
    AUTH_TOTP_KEY: "02".repeat(32),
  };
  expect(readApiEnvironment(input)).toEqual({
    ...input,
    API_PORT: 8081,
    MEDIA_STORAGE_ROOT: readApiEnvironment(input).MEDIA_STORAGE_ROOT,
  });
  for (const bad of [
    { ...input, DATABASE_URL: "https://example.test/" },
    { ...input, DATABASE_URL: "" },
    { ...input, API_PORT: "65536" },
    { ...input, API_PORT: "-1" },
    { ...input, API_HOST: "" },
  ]) {
    expect(() => readApiEnvironment(bad)).toThrow();
  }
});

test("[AUTH-04:startup] validates the exact public origin and requires independent auth keys", () => {
  const input = {
    DATABASE_URL: "postgresql://zaafran:fixture@127.0.0.1:5432/zaafran_test",
    AUTH_PUBLIC_ORIGIN: "https://zaafran.test",
    AUTH_OTP_KEY: "01".repeat(32),
    AUTH_TOTP_KEY: "02".repeat(32),
  };
  expect(readApiEnvironment(input).AUTH_PUBLIC_ORIGIN).toBe(input.AUTH_PUBLIC_ORIGIN);
  expect(
    readApiEnvironment({ ...input, AUTH_PUBLIC_ORIGIN: "http://127.0.0.1:3000" })
      .AUTH_PUBLIC_ORIGIN,
  ).toBe("http://127.0.0.1:3000");
  expect(
    readApiEnvironment({ ...input, API_TRUSTED_PROXY: "192.0.2.12/32" }).API_TRUSTED_PROXY,
  ).toBe("192.0.2.12/32");
  for (const bad of [
    { ...input, AUTH_PUBLIC_ORIGIN: "http://zaafran.test" },
    { ...input, AUTH_PUBLIC_ORIGIN: "https://zaafran.test/login" },
    { ...input, AUTH_PUBLIC_ORIGIN: "https://user@zaafran.test" },
    { ...input, AUTH_OTP_KEY: "too-short" },
    { ...input, AUTH_TOTP_KEY: input.AUTH_OTP_KEY },
    { ...input, AUTH_TOTP_KEY: undefined },
    { ...input, API_TRUSTED_PROXY: "0.0.0.0/0" },
    { ...input, API_TRUSTED_PROXY: "192.0.2.1/33" },
    { ...input, API_TRUSTED_PROXY: "true" },
  ])
    expect(() => readApiEnvironment(bad)).toThrow();
});

test("[MER-14:env] defaults the media storage root and rejects a relative path", () => {
  const input = {
    DATABASE_URL: "postgresql://zaafran:fixture@127.0.0.1:5432/zaafran_test",
    AUTH_PUBLIC_ORIGIN: "https://zaafran.test",
    AUTH_OTP_KEY: "01".repeat(32),
    AUTH_TOTP_KEY: "02".repeat(32),
  };
  expect(readApiEnvironment(input).MEDIA_STORAGE_ROOT.startsWith("/")).toBe(true);
  expect(
    readApiEnvironment({ ...input, MEDIA_STORAGE_ROOT: "/var/zaafran/media" }).MEDIA_STORAGE_ROOT,
  ).toBe("/var/zaafran/media");
  expect(() => readApiEnvironment({ ...input, MEDIA_STORAGE_ROOT: "relative/media" })).toThrow();
});

test("[GEO-03] private routes use only the loopback or Compose OSRM origin", () => {
  const input = {
    DATABASE_URL: "postgresql://zaafran:fixture@127.0.0.1:5432/zaafran_test",
    AUTH_PUBLIC_ORIGIN: "https://zaafran.test",
    AUTH_OTP_KEY: "01".repeat(32),
    AUTH_TOTP_KEY: "02".repeat(32),
  };
  for (const origin of ["http://osrm:5000", "http://127.0.0.1:5000"]) {
    expect(
      readApiEnvironment({ ...input, OSRM_INTERNAL_ORIGIN: origin }).OSRM_INTERNAL_ORIGIN,
    ).toBe(origin);
  }
  for (const origin of [
    "https://router.project-osrm.org",
    "http://osrm:5000/route",
    "ftp://osrm:5000",
  ]) {
    expect(() => readApiEnvironment({ ...input, OSRM_INTERNAL_ORIGIN: origin })).toThrow();
  }
});

test("accepts paired HTTPS authentication SMS credentials without embedded credentials or fragments", () => {
  const base = {
    DATABASE_URL: "postgresql://zaafran:local@127.0.0.1:5432/zaafran_dev",
    AUTH_PUBLIC_ORIGIN: "https://awid.example.test",
    AUTH_OTP_KEY: "01".repeat(32),
    AUTH_TOTP_KEY: "02".repeat(32),
  };
  const sms = {
    AUTH_SMS_WEBHOOK_URL: "https://sms.example.test/messages",
    AUTH_SMS_WEBHOOK_TOKEN: "synthetic-gateway-token",
  };
  expect(readApiEnvironment({ ...base, ...sms })).toMatchObject(sms);
  expect(() =>
    readApiEnvironment({ ...base, AUTH_SMS_WEBHOOK_TOKEN: sms.AUTH_SMS_WEBHOOK_TOKEN }),
  ).toThrow();
  for (const url of [
    "http://sms.example.test/messages",
    "https://user@sms.example.test",
    "https://sms.example.test/#fragment",
  ]) {
    expect(() => readApiEnvironment({ ...base, ...sms, AUTH_SMS_WEBHOOK_URL: url })).toThrow();
  }
});
