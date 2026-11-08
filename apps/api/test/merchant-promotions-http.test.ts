import { merchantPromotionListOutput } from "@zaafran/contracts/promotions";
import type { createMerchantPromotionsRepository } from "@zaafran/db/promotions";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMerchantPromotionsRepository>;
const now = new Date("2026-11-08T12:00:00Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const promotionId = "01932f18-3150-7c33-8a7a-53acfd343004";
const manager = { role: "merchant_manager", accountId, sessionId } as const;
const path = `/v1/merchants/${merchantId}/promotions`;
const input = {
  activation: { kind: "code", code: "FICTIF" },
  discount: { kind: "fixed", amountDzd: 50 },
  conditions: {},
} as const;
const promotion = { ...input, promotionId, merchantId, stats: { uses: 1, salesDzd: 400 } };
const headers = { "idempotency-key": "fixture-promotion", "x-expected-session-id": sessionId };
const create = { method: "POST", url: path, headers, payload: input } as const;
const update = { ...create, method: "PUT", url: `${path}/${promotionId}` } as const;

function setup(actor: Actor) {
  const repository = {
    list: vi.fn<Repository["list"]>(),
    create: vi.fn<Repository["create"]>(),
    update: vi.fn<Repository["update"]>(),
  } satisfies Repository;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    merchantPromotions: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-19:http] lists the scoped promotions and exact session", async () => {
  const { api, repository } = setup(manager);
  repository.list.mockResolvedValue({ promotions: [promotion] });
  const response = await api.inject(path);
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(merchantPromotionListOutput.parse(response.json())).toEqual({
    sessionId,
    promotions: [promotion],
  });
  expect(repository.list).toHaveBeenCalledExactlyOnceWith({ accountId, merchantId });
});

test("[MER-19:http] replays create and applies update without altering redemption stats", async () => {
  const { api, repository } = setup(manager);
  repository.create.mockResolvedValue({ kind: "replayed", promotion });
  repository.update.mockResolvedValue({ kind: "applied", promotion });
  const created = await api.inject({
    ...create,
    payload: { ...input, activation: { kind: "code", code: " FICTIF " } },
  });
  const updated = await api.inject(update);
  expect(created.statusCode).toBe(201);
  expect(updated.statusCode).toBe(200);
  expect(created.json()).toEqual(promotion);
  expect(updated.json()).toEqual(promotion);
  expect(repository.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      accountId,
      merchantId,
      input,
      now,
    }),
  );
  expect(repository.update).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      accountId,
      merchantId,
      input,
      now,
      promotionId,
    }),
  );
});

test("[MER-19:http] rejects stale session writes and maps duplicate merchant codes", async () => {
  const { api, repository } = setup(manager);
  const stale = await api.inject({
    ...update,
    headers: { ...headers, "x-expected-session-id": accountId },
  });
  expect(stale.statusCode).toBe(409);
  expect(repository.update).not.toHaveBeenCalled();
  repository.create.mockResolvedValue({ kind: "duplicate_code" });
  const duplicate = await api.inject(create);
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json()).toMatchObject({ code: "promotion_code_taken" });
});
