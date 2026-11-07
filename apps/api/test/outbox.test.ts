import { Writable } from "node:stream";
import { expect, test } from "vitest";
import { createApi } from "../src/app.ts";
import { registerDevOutbox } from "../src/dev-outbox.ts";
import { createOutbox } from "../src/fake-outbox.ts";
import { registerTestRoutes } from "../src/test-routes.ts";

function localApi() {
  return createApi({
    checkReadiness: () => Promise.resolve(),
    logStream: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });
}

test("[M0-4] the dev-only inbox exposes synthetic SMS and push fakes only to loopback", async () => {
  const api = localApi();
  const outbox = createOutbox();
  outbox.sendSms({ recipientRef: "synthetic-customer", text: "SMS fixture" });
  outbox.sendPush({
    recipientRef: "synthetic-driver",
    title: "Push fixture",
    body: "Test payload",
  });
  registerDevOutbox(api, outbox);

  try {
    const response = await api.inject("/__dev__/outbox");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sms: [{ recipientRef: "synthetic-customer", text: "SMS fixture" }],
      push: [{ recipientRef: "synthetic-driver", title: "Push fixture", body: "Test payload" }],
    });
    const nonlocal = await api.inject({ url: "/__dev__/outbox", remoteAddress: "192.0.2.8" });
    expect(nonlocal.statusCode).toBe(403);
  } finally {
    await api.close();
  }
});

test("[M0-6] test routes validate clock input and reset isolated fake state", async () => {
  const api = localApi();
  const outbox = createOutbox();
  const now = registerTestRoutes(api, outbox);
  outbox.sendSms({ recipientRef: "synthetic-customer", text: "SMS fixture" });

  try {
    const invalid = await api.inject({
      method: "POST",
      url: "/__test__/clock",
      payload: { now: "invalid", extra: true },
    });
    expect(invalid.statusCode).toBe(400);
    const clock = await api.inject({
      method: "POST",
      url: "/__test__/clock",
      payload: { now: "2027-02-08T17:30:00.000Z" },
    });
    expect(clock.statusCode).toBe(200);
    expect(now()).toEqual(new Date("2027-02-08T17:30:00.000Z"));
    const snapshot = await api.inject("/__test__/outbox");
    expect(snapshot.json()).toMatchObject({ sms: [{ text: "SMS fixture" }] });
    expect((await api.inject({ method: "POST", url: "/__test__/reset" })).statusCode).toBe(204);
    expect((await api.inject("/__test__/outbox")).json()).toEqual({ sms: [], push: [] });
  } finally {
    await api.close();
  }
});
