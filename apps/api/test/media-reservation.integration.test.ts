import { randomUUIDv7 } from "node:crypto";
import { mediaOutput } from "@zaafran/contracts/media";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const { openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(
  "2026-11-07T12:00:00.000Z",
);
const reservationPath = "/v1/media/uploads";
const photo = { contentType: "image/heic", bytes: 512 };

function commandHeaders(actor: Awaited<ReturnType<typeof seedActor>>, key = randomUUIDv7()) {
  return { ...actor.headers, "idempotency-key": key, "x-expected-session-id": actor.sessionId };
}

test("[MER-14:http] reserves one application photo and keeps it private across accounts", async () => {
  const api = await openApi();
  const owner = await seedActor("+213500000060", "standard");
  const outsider = await seedActor("+213500000061", "standard");
  const admin = await seedActor("+213500000062", "admin");
  const request = {
    method: "POST",
    url: reservationPath,
    headers: commandHeaders(owner),
    payload: { ...photo, kind: "application" },
  } as const;

  const created = await api.inject(request);
  expect(created.statusCode).toBe(201);
  const reserved = mediaOutput.parse(created.json());
  expect(reserved).toMatchObject({
    kind: "application",
    status: "awaiting_upload",
    sessionId: owner.sessionId,
  });
  const replay = await api.inject(request);
  expect(replay.statusCode).toBe(201);
  expect(replay.json()).toEqual(created.json());
  const conflict = await api.inject({ ...request, payload: { ...request.payload, bytes: 513 } });
  expect(conflict.statusCode).toBe(409);

  const url = `/v1/media/${reserved.mediaId}`;
  const ownRead = await api.inject({ url, headers: owner.headers });
  expect(ownRead.statusCode).toBe(200);
  expect(ownRead.json()).toEqual(created.json());
  expect((await api.inject({ url, headers: outsider.headers })).statusCode).toBe(404);
  expect((await api.inject({ url, headers: admin.headers })).statusCode).toBe(403);
});

test("[MER-14:http] [MER-23:http] checks the actor's role at the exact restaurant", async () => {
  const api = await openApi();
  const account = await seedActor("+213500000063", "standard");
  const { owned, staffed } = await seedMenuMerchants(account.userId);
  const request = {
    method: "POST",
    url: reservationPath,
    payload: { ...photo, kind: "item", merchantId: owned },
  } as const;
  expect((await api.inject({ ...request, headers: commandHeaders(account) })).statusCode).toBe(201);
  const forbidden = await api.inject({
    ...request,
    headers: commandHeaders(account),
    payload: { ...request.payload, merchantId: staffed },
  });
  expect(forbidden.statusCode).toBe(404);
  expect(forbidden.headers["cache-control"]).toBe("no-store");
});
