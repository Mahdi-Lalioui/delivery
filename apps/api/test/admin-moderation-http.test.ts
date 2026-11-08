import { createHash } from "node:crypto";
import { adminItemQueueOutput } from "@zaafran/contracts/admin-moderation";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { createMenuModerationRepository } from "@zaafran/db/menu-moderation";
import type { LightMyRequestResponse } from "fastify";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type ModerationRepository = ReturnType<typeof createMenuModerationRepository>;

const now = new Date("2026-11-08T12:00:00.000Z");
const itemId = "01932f18-3150-7c33-8a7a-53acfd343101";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343002";
const adminUserId = "01932f18-3150-7c33-8a7a-53acfd343004";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343007";
const admin = { role: "admin", accountId: adminUserId, sessionId } as const;
const customer = { role: "customer", accountId: merchantId, sessionId } as const;
const queuePath = "/v1/admin/menu-items/held";
const idempotencyKey = "fixture-item-review";
const headers = { "idempotency-key": idempotencyKey, "x-expected-session-id": sessionId };
const reviewRequest = {
  method: "POST",
  url: `/v1/admin/menu-items/${itemId}/review`,
  headers,
  payload: { decision: "reject", reason: " Alcool " },
} as const;

function expectProblem(response: LightMyRequestResponse, status: number, code: string) {
  expect(response.statusCode).toBe(status);
  expect(problemResponseSchema.parse(response.json())).toMatchObject({ status, code });
}

function setup(actor?: Actor) {
  const repository = {
    listHeldItems: vi.fn<ModerationRepository["listHeldItems"]>(),
    reviewItem: vi.fn<ModerationRepository["reviewItem"]>(),
  } satisfies ModerationRepository;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: vi.fn(() => Promise.resolve(actor)),
    menuModeration: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[ADM-04:http] the held-item queue reports the matched categories for each item", async () => {
  const { api, repository } = setup(admin);
  const held = {
    itemId,
    merchantId,
    restaurantName: "Table fictive",
    names: { fr: "Bière pression", ar: "شيشة" },
    descriptions: { fr: "Servie fraîche" },
  };
  repository.listHeldItems.mockResolvedValue({ items: [held], nextCursor: itemId });

  const response = await api.inject(`${queuePath}?limit=1&cursor=${merchantId}`);

  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(adminItemQueueOutput.parse(response.json())).toEqual({
    sessionId,
    items: [{ ...held, matches: ["alcohol", "tobacco"] }],
    nextCursor: itemId,
  });
  expect(repository.listHeldItems).toHaveBeenCalledExactlyOnceWith({
    adminUserId,
    cursor: merchantId,
    limit: 1,
  });
});

test("[ADM-04:http] the queue maps a repository admin denial to 403", async () => {
  const { api, repository } = setup(admin);
  repository.listHeldItems.mockResolvedValue(undefined);
  expectProblem(await api.inject(`${queuePath}?limit=10`), 403, "forbidden");
});

test("[ADM-04:http] a review passes a trimmed, key-bound decision and returns its result", async () => {
  const { api, repository } = setup(admin);
  const result = { itemId, merchantId, status: "rejected", reviewedAt: now } as const;
  repository.reviewItem.mockResolvedValue({ kind: "reviewed", ...result });

  const response = await api.inject(reviewRequest);

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    itemId,
    merchantId,
    moderationStatus: "rejected",
    reviewedAt: now.toISOString(),
  });
  const [call] = repository.reviewItem.mock.calls;
  if (!call) throw new Error("Expected a review command.");
  const [{ requestHash, ...command }] = call;
  expect(command).toEqual({
    adminUserId,
    itemId,
    decision: "reject",
    reason: "Alcool",
    now,
    idempotencyKeyHash: createHash("sha256").update(idempotencyKey).digest(),
  });
  expect(requestHash).toHaveLength(32);
});

test.each([
  ["not_found", 404],
  ["invalid_status", 409],
  ["idempotency_conflict", 409],
  ["forbidden", 403],
] as const)("[ADM-04:http] a review maps %s to %i", async (kind, status) => {
  const { api, repository } = setup(admin);
  repository.reviewItem.mockResolvedValue({ kind });
  expectProblem(await api.inject(reviewRequest), status, kind);
});

test("[ADM-04:http] a review rejects a stale session, a bad id and a non-admin", async () => {
  const { api, repository } = setup(admin);
  const stale = { ...headers, "x-expected-session-id": merchantId };
  expectProblem(await api.inject({ ...reviewRequest, headers: stale }), 409, "session_changed");
  const badId = { ...reviewRequest, url: "/v1/admin/menu-items/bad/review" };
  expectProblem(await api.inject(badId), 400, "invalid_request");
  expect(repository.reviewItem).not.toHaveBeenCalled();
  const other = setup(customer);
  expectProblem(await other.api.inject(reviewRequest), 403, "forbidden");
});
