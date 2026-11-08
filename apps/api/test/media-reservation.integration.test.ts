import { createHash, randomUUIDv7 } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { mediaOutput } from "@zaafran/contracts/media";
import { createMediaRepository } from "@zaafran/db/media";
import { createLocalMediaStore } from "@zaafran/media";
import { expect, onTestFinished, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(
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

test("[MER-14:http] serves an adopted private preview through the production API", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "zaafran-preview-api-"));
  onTestFinished(() => rm(mediaRoot, { recursive: true, force: true }));
  const api = await openApi(undefined, undefined, mediaRoot);
  const owner = await seedActor("+213500000064", "standard");
  const outsider = await seedActor("+213500000065", "standard");
  const reserved = await api.inject({
    method: "POST",
    url: reservationPath,
    headers: commandHeaders(owner),
    payload: { kind: "application", contentType: "image/png", bytes: 4 },
  });
  expect(reserved.statusCode).toBe(201);
  const { mediaId } = mediaOutput.parse(reserved.json());
  const quarantineKey = "quarantine/" + mediaId;
  await database.get().sql`
    UPDATE public.media_uploads
    SET status = 'preparing', quarantine_key = ${quarantineKey},
      content_digest = ${Buffer.alloc(32)}, adopted_at = now()
    WHERE id = ${mediaId}
  `;

  const url = "/v1/media/" + mediaId;
  expect((await api.inject({ url: url + "/preview", headers: owner.headers })).statusCode).toBe(
    404,
  );
  const repository = createMediaRepository(database.get());
  const bytes = Buffer.from("synthetic preview");
  const previewKey = "preview/" + mediaId;
  await createLocalMediaStore({ root: mediaRoot }).put({
    key: previewKey,
    body: Readable.from([bytes]),
    bytes: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("base64"),
  });
  expect(
    await repository.completePreparation({
      mediaId,
      quarantineKey,
      result: { status: "awaiting_crop", previewKey, width: 96, height: 64 },
    }),
  ).toBe(true);

  const status = await api.inject({ url, headers: owner.headers });
  expect(status.json()).toEqual({
    mediaId,
    sessionId: owner.sessionId,
    kind: "application",
    status: "awaiting_crop",
    width: 96,
    height: 64,
  });
  const preview = await api.inject({ url: url + "/preview", headers: owner.headers });
  expect(preview.statusCode).toBe(200);
  expect(preview.rawPayload).toEqual(bytes);
  expect((await api.inject({ url: url + "/preview", headers: outsider.headers })).statusCode).toBe(
    404,
  );
});
