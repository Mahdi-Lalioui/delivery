import {
  menuItemArchiveOutput,
  menuItemAvailabilityOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
} from "@zaafran/contracts/menu";
import type { createMenuItemRepository } from "@zaafran/db/menu-item";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMenuItemRepository>;

const now = new Date("2026-11-07T12:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const categoryId = "01932f18-3150-7c33-8a7a-53acfd343004";
const itemId = "01932f18-3150-7c33-8a7a-53acfd343005";
const optionGroupId = "01932f18-3150-7c33-8a7a-53acfd343006";
const owner = { role: "merchant_owner", accountId, sessionId } as const;
const staff = { ...owner, role: "merchant_staff" } as const;
const path = "/v1/merchants/" + merchantId + "/menu/items";
const itemPath = path + "/" + itemId;
const listPath = path + "?categoryId=" + categoryId;
const headers = { "idempotency-key": "fixture-item-command", "x-expected-session-id": sessionId };
const item = {
  categoryId,
  names: { ar: "طبق تجريبي", fr: "Plat fictif" },
  descriptions: { fr: "Description fictive" },
  priceDzd: 750,
  photoId: null,
  tags: [],
  extraPrepMinutes: 8,
  optionGroupIds: [optionGroupId],
};
const itemView = {
  ...item,
  itemId,
  isAvailable: true,
  soldOutUntil: null,
  moderationStatus: "unreviewed" as const,
};
const revision = { expectedRevision: 4 };
const create = { method: "POST", url: path, headers, payload: { ...item, ...revision } } as const;
const update = { method: "PUT", url: itemPath, headers, payload: create.payload } as const;
const duplicate = {
  method: "POST",
  url: itemPath + "/duplicate",
  headers,
  payload: revision,
} as const;
const archive = { method: "POST", url: itemPath + "/archive", headers, payload: revision } as const;
const availability = {
  method: "PUT",
  url: itemPath + "/availability",
  headers,
  payload: { ...revision, availability: "end_of_day" },
} as const;

function setup(actor?: Actor) {
  const repository = {
    list: vi.fn<Repository["list"]>(),
    create: vi.fn<Repository["create"]>(),
    update: vi.fn<Repository["update"]>(),
    duplicate: vi.fn<Repository["duplicate"]>(),
    archive: vi.fn<Repository["archive"]>(),
    setAvailability: vi.fn<Repository["setAvailability"]>(),
  } satisfies Repository;
  const options = {
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    menuItem: { repository, now: () => now },
  };
  const api = createApi(options);
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-09:http] reads a private category-scoped item page and decodes the revision cursor", async () => {
  const { api, repository } = setup(owner);
  repository.list.mockResolvedValue({
    kind: "listed",
    revision: 4,
    items: [itemView],
    nextCursor: null,
  });
  const result = await api.inject(
    listPath + "&limit=10&cursor=" + encodeURIComponent("4~" + itemId),
  );
  expect(result.statusCode).toBe(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(menuItemPageOutput.parse(result.json())).toEqual({
    sessionId,
    revision: 4,
    items: [itemView],
    nextCursor: null,
  });
  expect(repository.list).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    categoryId,
    limit: 10,
    cursor: { revision: 4, itemId },
    now,
  });
  expect((await api.inject(path)).statusCode).toBe(400);
  expect(repository.list).toHaveBeenCalledTimes(1);
});

test("[MER-09:http] creates and updates an integer-priced item without silently dropping photos", async () => {
  const { api, repository } = setup(owner);
  repository.create.mockResolvedValue({ kind: "applied", revision: 5, item: itemView });
  repository.update.mockResolvedValue({ kind: "replayed", revision: 5, item: itemView });

  const unready = await api.inject({
    ...create,
    payload: { ...create.payload, photoId: optionGroupId },
  });
  expect(unready.statusCode).toBe(409);
  expect(unready.json()).toMatchObject({ code: "photos_unavailable" });
  expect(
    (await api.inject({ ...create, payload: { ...create.payload, priceDzd: 49.5 } })).statusCode,
  ).toBe(400);
  expect(repository.create).not.toHaveBeenCalled();

  const created = await api.inject(create);
  expect(created.statusCode).toBe(201);
  expect(menuItemWriteOutput.parse(created.json())).toEqual({ revision: 5, item: itemView });
  expect(repository.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, input: create.payload, now }),
  );
  const updated = await api.inject(update);
  expect(updated.statusCode).toBe(200);
  expect(menuItemWriteOutput.parse(updated.json())).toEqual({ revision: 5, item: itemView });
  expect(repository.update).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, itemId, input: update.payload, now }),
  );
});

test("[MER-09:http] duplicates and archives items with their original revision receipts", async () => {
  const { api, repository } = setup(owner);
  repository.duplicate.mockResolvedValue({ kind: "replayed", revision: 5, item: itemView });
  repository.archive.mockResolvedValue({
    kind: "applied",
    revision: 5,
    itemId,
    archivedAt: now.toISOString(),
  });

  const cloned = await api.inject(duplicate);
  expect(cloned.statusCode).toBe(201);
  expect(menuItemWriteOutput.parse(cloned.json())).toEqual({ item: itemView, revision: 5 });
  expect(repository.duplicate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, itemId, input: revision }),
  );

  const archived = await api.inject(archive);
  expect(archived.statusCode).toBe(200);
  expect(menuItemArchiveOutput.parse(archived.json())).toEqual({
    itemId,
    archivedAt: now.toISOString(),
    revision: 5,
  });
  expect(repository.archive).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, itemId, input: revision }),
  );
});

test("[MER-23:http] staff can only call the availability command and see its narrow result", async () => {
  const { api, repository } = setup(staff);
  const state = {
    itemId,
    revision: 5,
    isAvailable: false,
    soldOutUntil: "2026-11-07T23:00:00.000Z",
  };
  repository.setAvailability.mockResolvedValue({ kind: "applied", ...state });
  expect((await api.inject(listPath)).statusCode).toBe(403);
  for (const command of [create, update, duplicate, archive])
    expect((await api.inject(command)).statusCode).toBe(403);

  const result = await api.inject(availability);
  expect(result.statusCode).toBe(200);
  expect(menuItemAvailabilityOutput.parse(result.json())).toEqual(state);
  expect(repository.setAvailability).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, itemId, input: availability.payload, now }),
  );
  for (const method of [
    repository.list,
    repository.create,
    repository.update,
    repository.duplicate,
    repository.archive,
  ])
    expect(method).not.toHaveBeenCalled();
});

test("[AUTH-06:http] stale item commands fail before any repository mutation", async () => {
  const { api, repository } = setup(owner);
  for (const command of [create, update, duplicate, archive, availability]) {
    const response = await api.inject({
      ...command,
      headers: { ...headers, "x-expected-session-id": categoryId },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "session_changed" });
  }
  for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
});

test("[MER-09:http] maps scoped read and write conflicts", async () => {
  const { api, repository } = setup(owner);
  repository.list.mockResolvedValue({ kind: "invalid_cursor" });
  repository.update.mockResolvedValue({ kind: "not_found" });
  repository.archive.mockResolvedValue({ kind: "revision_conflict" });
  repository.duplicate.mockResolvedValue({ kind: "idempotency_conflict" });
  for (const [request, status, code] of [
    [listPath, 400, "invalid_cursor"],
    [update, 404, "not_found"],
    [archive, 409, "revision_conflict"],
    [duplicate, 409, "idempotency_conflict"],
  ] as const) {
    const response = await api.inject(request);
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code });
  }
});
