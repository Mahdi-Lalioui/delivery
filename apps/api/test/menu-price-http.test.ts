import { bulkPriceApplyOutput, bulkPricePreviewOutput } from "@zaafran/contracts/menu-price";
import type { createMenuPriceRepository } from "@zaafran/db/menu-price";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMenuPriceRepository>;

const now = new Date("2026-11-07T12:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const itemId = "01932f18-3150-7c33-8a7a-53acfd343004";
const owner = { role: "merchant_owner", accountId, sessionId } as const;
const staff = { ...owner, role: "merchant_staff" } as const;
const path = "/v1/merchants/" + merchantId + "/menu/prices";
const headers = { "idempotency-key": "fixture-bulk-price", "x-expected-session-id": sessionId };
const adjustment = { kind: "percent", basisPoints: 1_000 } as const;
const previewPayload = { itemIds: [itemId], adjustment, roundingUnit: 10 } as const;
const applyPayload = { ...previewPayload, expectedRevision: 4 };
const changeItem = { itemId, oldPriceDzd: 500, newPriceDzd: 550 };

function setup(actor?: Actor) {
  const repository = {
    preview: vi.fn<Repository["preview"]>(),
    apply: vi.fn<Repository["apply"]>(),
  } satisfies Repository;
  const options = {
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    menuPrice: { repository, now: () => now },
  };
  const api = createApi(options);
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-11:http] previews a bulk price change without mutating any state", async () => {
  const { api, repository } = setup(owner);
  repository.preview.mockResolvedValue({ kind: "previewed", revision: 4, items: [changeItem] });

  const result = await api.inject({
    method: "POST",
    url: path + "/preview",
    payload: previewPayload,
  });
  expect(result.statusCode).toBe(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(bulkPricePreviewOutput.parse(result.json())).toEqual({
    sessionId,
    revision: 4,
    items: [changeItem],
  });
  expect(repository.preview).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    itemIds: [itemId],
    adjustment,
    roundingUnit: 10,
  });
});

test("[MER-11:http] reports a missing item instead of a silent empty preview", async () => {
  const { api, repository } = setup(owner);
  repository.preview.mockResolvedValue({ kind: "not_found" });
  const result = await api.inject({
    method: "POST",
    url: path + "/preview",
    payload: previewPayload,
  });
  expect(result.statusCode).toBe(404);
  expect(result.json()).toMatchObject({ code: "not_found" });
});

test("[MER-11:http] applies the bound preview and returns the batch id", async () => {
  const { api, repository } = setup(owner);
  repository.apply.mockResolvedValue({
    kind: "applied",
    revision: 5,
    batchId: "01932f18-3150-7c33-8a7a-53acfd343099",
    items: [changeItem],
  });

  const result = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: applyPayload,
  });
  expect(result.statusCode).toBe(201);
  expect(bulkPriceApplyOutput.parse(result.json())).toEqual({
    batchId: "01932f18-3150-7c33-8a7a-53acfd343099",
    revision: 5,
    items: [changeItem],
  });
  expect(repository.apply).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, input: applyPayload, now }),
  );
});

test("[MER-11:http] rejects a stale revision and an overflowing adjustment", async () => {
  const { api, repository } = setup(owner);
  repository.apply.mockResolvedValue({ kind: "revision_conflict" });
  const stale = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: applyPayload,
  });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "revision_conflict" });

  repository.apply.mockResolvedValue({ kind: "invalid_bulk_price_change" });
  const invalid = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: applyPayload,
  });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.json()).toMatchObject({ code: "invalid_bulk_price_change" });
});

test("[MER-11:http] denies staff from previewing or applying a bulk price change", async () => {
  const { api, repository } = setup(staff);
  expect(
    (await api.inject({ method: "POST", url: path + "/preview", payload: previewPayload }))
      .statusCode,
  ).toBe(403);
  expect(
    (await api.inject({ method: "POST", url: path + "/apply", headers, payload: applyPayload }))
      .statusCode,
  ).toBe(403);
  expect(repository.preview).not.toHaveBeenCalled();
  expect(repository.apply).not.toHaveBeenCalled();
});
