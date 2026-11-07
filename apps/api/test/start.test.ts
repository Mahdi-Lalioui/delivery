import { expect, test } from "vitest";
import { startApi } from "../src/start.ts";

const environment = {
  DATABASE_URL: "postgresql://zaafran:fixture@127.0.0.1:5432/zaafran_test",
  API_HOST: "127.0.0.1",
  API_PORT: "8081",
  AUTH_PUBLIC_ORIGIN: "https://zaafran.test",
  AUTH_OTP_KEY: "01".repeat(32),
  AUTH_TOTP_KEY: "02".repeat(32),
};

test("[M0-6] starts the configured API with the validated listener settings", async () => {
  const api = await startApi({
    environment,
    async listen(app, options) {
      expect(options).toEqual({ host: "127.0.0.1", port: 8081 });
      await app.ready();
      return "http://127.0.0.1:8081";
    },
  });
  try {
    expect((await api.inject("/healthz")).statusCode).toBe(200);
  } finally {
    await api.close();
  }
});

test("[M0-6] closes dependencies after a listener startup error", async () => {
  let isClosed = false;
  await expect(
    startApi({
      environment,
      configure(app) {
        app.addHook("onClose", () => {
          isClosed = true;
          return Promise.resolve();
        });
      },
      listen: () => Promise.reject(new Error("listener fixture failure")),
    }),
  ).rejects.toThrow("listener fixture failure");
  expect(isClosed).toBe(true);
});

test("[AUTH-04:startup] refuses to open a listener without auth configuration", async () => {
  let didListen = false;
  await expect(
    startApi({
      environment: { ...environment, AUTH_OTP_KEY: undefined },
      listen() {
        didListen = true;
        return Promise.resolve("http://127.0.0.1:8081");
      },
    }),
  ).rejects.toThrow();
  expect(didListen).toBe(false);
});
