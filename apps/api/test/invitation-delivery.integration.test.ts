import { randomUUIDv7 } from "node:crypto";
import { createTwilioSender } from "@zaafran/notifications";
import { expect, test, vi } from "vitest";
import { createSmsMessages } from "../src/auth-sms-adapter.ts";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const { openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(
  "2026-11-20T12:00:00.000Z",
);
const cases = [
  { kind: "staff", index: 1 },
  { kind: "courier", index: 2 },
] as const;

async function setup(kind: "staff" | "courier", index: number) {
  const owner = await seedActor(`+21350000090${String(index)}`, "standard");
  const { owned } = await seedMenuMerchants(owner.userId, `170${String(index)}`);
  const send = vi
    .fn<typeof fetch>()
    .mockImplementation(() => Promise.resolve(new Response(null, { status: 201 })));
  const messages = createSmsMessages(
    createTwilioSender({ accountSid: "fixture", from: "AWID", authToken: "fixture" }, send),
    "https://awid.example.test",
  );
  const api = await openApi(undefined, messages);
  const key = randomUUIDv7();
  const phone = `+21355000090${String(index)}`;
  const invite = (instance = api) =>
    instance.inject({
      method: "POST",
      url:
        "/v1/merchants/" + owned + (kind === "staff" ? "/staff/invitations" : "/couriers/invites"),
      headers: {
        ...owner.headers,
        "x-expected-session-id": owner.sessionId,
        "idempotency-key": key,
      },
      payload: kind === "staff" ? { phone, role: "manager" } : { phone },
    });
  return { send, invite, openAnotherApi: () => openApi(undefined, messages) };
}

test.each(cases)(
  "[MER-23][COU-01] concurrent and completed $kind invite retries send only one SMS",
  async ({ kind, index }) => {
    const { invite, send, openAnotherApi } = await setup(kind, index);
    const other = await openAnotherApi();
    const started = Promise.withResolvers<undefined>();
    const result = Promise.withResolvers<Response>();
    send.mockImplementationOnce(() => {
      started.resolve(undefined);
      return result.promise;
    });
    const first = Promise.resolve(invite());
    let concurrent;
    try {
      await started.promise;
      concurrent = await invite(other);
    } finally {
      result.resolve(new Response(null, { status: 201 }));
    }
    const firstResponse = await first;
    expect(firstResponse.statusCode).toBe(201);
    expect(concurrent.statusCode).toBe(503);
    const replay = await invite(other);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(firstResponse.json());
    expect(send).toHaveBeenCalledTimes(1);
  },
);

test.each(cases)(
  "[MER-23][COU-01] $kind invite retries a definitive provider rejection once",
  async ({ kind, index }) => {
    const { invite, send } = await setup(kind, index + 2);
    send.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await invite()).statusCode).toBe(503);
    expect((await invite()).statusCode).toBe(201);
    expect((await invite()).statusCode).toBe(201);
    expect(send).toHaveBeenCalledTimes(2);
  },
);

test.each(cases)(
  "[MER-23][COU-01] $kind invite holds an ambiguous provider result across retries",
  async ({ kind, index }) => {
    const { invite, send } = await setup(kind, index + 4);
    send.mockRejectedValueOnce(new TypeError("Synthetic connection interrupted"));
    expect((await invite()).statusCode).toBe(503);
    expect((await invite()).statusCode).toBe(503);
    expect(send).toHaveBeenCalledTimes(1);
  },
);
