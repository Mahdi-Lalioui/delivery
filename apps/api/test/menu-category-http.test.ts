import { createHash } from "node:crypto";
import {
  menuCategoryOrderOutput,
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
} from "@zaafran/contracts/menu";
import type { createMenuCategoryRepository } from "@zaafran/db/menu-category";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMenuCategoryRepository>;

const now = new Date("2026-11-07T12:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const categoryId = "01932f18-3150-7c33-8a7a-53acfd343004";
const secondId = "01932f18-3150-7c33-8a7a-53acfd343005";
const idempotencyKey = "fixture-category-command";
const actor = { role: "customer", accountId, sessionId } as const;
const path = `/v1/merchants/${merchantId}/menu/categories`;
const headers = { "idempotency-key": idempotencyKey, "x-expected-session-id": sessionId };
const payload = { names: { fr: "Plats fictifs" }, availability: null, expectedRevision: 7 };
const category = { categoryId, names: payload.names, availability: null, position: 0 };
const createRequest = { method: "POST", url: path, headers, payload } as const;
const renameRequest = { method: "PUT", url: path + "/" + categoryId, headers, payload } as const;
const reorderRequest = {
  method: "PUT",
  url: path + "/order",
  headers,
  payload: { categoryIds: [secondId, categoryId], expectedRevision: 7 },
} as const;

function setup(authenticated?: Actor) {
  const repository = {
    list: vi.fn<Repository["list"]>(),
    create: vi.fn<Repository["create"]>(),
    rename: vi.fn<Repository["rename"]>(),
    reorder: vi.fn<Repository["reorder"]>(),
  } satisfies Repository;
  const options = {
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(authenticated),
    menuCategory: { repository, now: () => now },
  };
  const api = createApi(options);
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-09:http] reads a bounded category page from the authenticated merchant scope", async () => {
  const { api, repository } = setup(actor);
  const cursor = "7~0~" + categoryId;
  repository.list.mockResolvedValue({
    kind: "listed",
    revision: 7,
    context: { restaurantName: "مطعم تجريبي" },
    categories: [category],
    nextCursor: null,
  });

  const response = await api.inject(path + "?cursor=" + encodeURIComponent(cursor) + "&limit=1");
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(menuCategoryPageOutput.parse(response.json())).toEqual({
    sessionId,
    revision: 7,
    context: { restaurantName: "مطعم تجريبي" },
    categories: [category],
    nextCursor: null,
  });
  expect(repository.list).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    limit: 1,
    cursor: { revision: 7, position: 0, categoryId },
  });

  expect((await api.inject(path + "?cursor=bad")).statusCode).toBe(400);
  expect(repository.list).toHaveBeenCalledTimes(1);
});

test("[MER-09:http] creates and renames a bilingual category with strict session-bound commands", async () => {
  const { api, repository } = setup(actor);
  repository.create.mockResolvedValue({ kind: "applied", revision: 8, category });
  repository.rename.mockResolvedValue({ kind: "replayed", revision: 8, category });

  const invalid = await api.inject({
    ...createRequest,
    payload: { ...payload, names: { fr: "\ud800" } },
  });
  expect(invalid.statusCode).toBe(400);
  expect(repository.create).not.toHaveBeenCalled();

  const created = await api.inject(createRequest);
  expect(created.statusCode).toBe(201);
  expect(menuCategoryWriteOutput.parse(created.json())).toEqual({ revision: 8, category });
  expect(repository.create).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    input: payload,
    idempotencyKeyHash: createHash("sha256").update(idempotencyKey).digest(),
    requestHash: createHash("sha256").update(JSON.stringify(payload)).digest(),
    now,
  });

  const renamed = await api.inject(renameRequest);
  expect(renamed.statusCode).toBe(200);
  expect(menuCategoryWriteOutput.parse(renamed.json())).toEqual({ revision: 8, category });
  expect(repository.rename).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, categoryId, input: payload }),
  );
});

test("[MER-09:http] sends the full permutation to the reorder operation", async () => {
  const { api, repository } = setup(actor);
  const categoryIds = [...reorderRequest.payload.categoryIds];
  repository.reorder.mockResolvedValue({ kind: "applied", revision: 8, categoryIds });

  const response = await api.inject(reorderRequest);
  expect(response.statusCode).toBe(200);
  expect(menuCategoryOrderOutput.parse(response.json())).toEqual({ revision: 8, categoryIds });
  expect(repository.reorder).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, input: reorderRequest.payload }),
  );
});

test.each([
  [undefined, 401],
  [{ ...actor, role: "merchant_staff" }, 403],
  [{ ...actor, role: "admin" }, 403],
] as const)(
  "[MER-23:http] denies actors outside the general editor role matrix",
  async (candidate, status) => {
    const { api, repository } = setup(candidate);
    expect((await api.inject(path)).statusCode).toBe(status);
    for (const request of [createRequest, renameRequest, reorderRequest]) {
      expect((await api.inject(request)).statusCode).toBe(status);
    }
    for (const query of Object.values(repository)) expect(query).not.toHaveBeenCalled();
  },
);

test("[AUTH-06:http] rejects missing or changed sessions before issuing a category command", async () => {
  const { api, repository } = setup(actor);
  for (const request of [createRequest, renameRequest, reorderRequest]) {
    const missing = await api.inject({
      ...request,
      headers: { "idempotency-key": idempotencyKey },
    });
    expect(missing.statusCode).toBe(400);
    const changed = await api.inject({
      ...request,
      headers: { ...headers, "x-expected-session-id": secondId },
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: "session_changed" });
  }
  for (const query of Object.values(repository)) expect(query).not.toHaveBeenCalled();
});

test.each([
  ["not_found", 404],
  ["revision_conflict", 409],
  ["idempotency_conflict", 409],
  ["category_limit", 409],
] as const)(
  "[MER-09:http] maps creation failure %s to its problem response",
  async (kind, status) => {
    const { api, repository } = setup(actor);
    repository.create.mockResolvedValue({ kind });
    const response = await api.inject(createRequest);
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ status, code: kind });
  },
);

test("[MER-09:http] distinguishes stale pages from out-of-scope resources and invalid permutations", async () => {
  const { api, repository } = setup(actor);
  repository.list
    .mockResolvedValueOnce({ kind: "revision_conflict" })
    .mockResolvedValueOnce({ kind: "not_found" });
  repository.reorder.mockResolvedValue({ kind: "invalid_order" });

  const stale = await api.inject(path);
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "revision_conflict" });
  expect((await api.inject(path)).statusCode).toBe(404);
  const invalid = await api.inject(reorderRequest);
  expect(invalid.statusCode).toBe(422);
  expect(invalid.json()).toMatchObject({ code: "invalid_order" });
});
