import { createHash } from "node:crypto";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { merchantOnboardingOutput } from "@zaafran/contracts/merchant";
import type { createMerchantRepository } from "@zaafran/db/merchant";
import type { LightMyRequestResponse } from "fastify";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type MerchantRepository = ReturnType<typeof createMerchantRepository>;

const now = new Date("2026-11-07T12:00:00.000Z");
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343002";
const accountId = "01932f18-3150-7c33-8a7a-53acfd343003";
const adminUserId = "01932f18-3150-7c33-8a7a-53acfd343004";
const otherAccountId = "01932f18-3150-7c33-8a7a-53acfd343005";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343007";
const staleSessionId = "01932f18-3150-7c33-8a7a-53acfd343008";
const customer = { role: "customer", accountId, sessionId } as const;
const admin = { role: "admin", accountId: adminUserId, sessionId } as const;
const applicationsPath = "/v1/merchant-applications";
const queuePath = "/v1/admin/merchant-applications";
const reviewPath = `${queuePath}/${merchantId}/review`;
const membershipsPath = "/v1/me/merchants";
const onboardingPath = `/v1/merchants/${merchantId}/onboarding`;
const idempotencyKey = "fixture-merchant-command";
const headers = { "idempotency-key": idempotencyKey, "x-expected-session-id": sessionId };
const keyHash = createHash("sha256").update(idempotencyKey).digest();
const commune = {
  id: "01932f18-3150-7c33-8a7a-53acfd343001",
  code: "1602",
  wilayaCode: 16,
  nameAr: "بلدية الاختبار",
  nameFr: "Commune de test",
};
const application = {
  restaurantName: "Restaurant fictif du test",
  ownerName: "Propriétaire de test",
  communeId: commune.id,
  pin: { latitude: 36.7631, longitude: 3.0562 },
  cuisines: ["algerian", "grill"],
  rcNumber: "22B1234567",
};
const applicationRequest = {
  method: "POST",
  url: applicationsPath,
  headers,
  payload: application,
} as const;
const reviewRequest = {
  method: "POST",
  url: reviewPath,
  headers,
  payload: { decision: "approve", reason: "Verified fixture" },
} as const;

function expectProblem(response: LightMyRequestResponse, status: number, code: string) {
  expect(response.statusCode).toBe(status);
  expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
  const problem = problemResponseSchema.parse(response.json());
  expect(problem).toMatchObject({ status, code });
  expect(response.headers["x-request-id"]).toBe(problem.requestId);
}

function setup(actor?: Actor) {
  const repository = {
    listCommunes: vi.fn<MerchantRepository["listCommunes"]>(),
    listPendingApplications: vi.fn<MerchantRepository["listPendingApplications"]>(),
    submitApplication: vi.fn<MerchantRepository["submitApplication"]>(),
    reviewApplication: vi.fn<MerchantRepository["reviewApplication"]>(),
    listMemberships: vi.fn<MerchantRepository["listMemberships"]>(),
    getOnboarding: vi.fn<MerchantRepository["getOnboarding"]>(),
    findManagedMerchant: vi.fn<MerchantRepository["findManagedMerchant"]>(),
  } satisfies MerchantRepository;
  const resolveActor = vi.fn(() => Promise.resolve(actor));
  const options = {
    checkReadiness: () => Promise.resolve(),
    resolveActor,
    merchant: { repository, now: () => now },
  };
  const api = createApi(options);
  onTestFinished(() => api.close());
  return { api, repository, resolveActor };
}

test("[MER-01:http] the public commune list parses a bounded numeric page request", async () => {
  const { api, repository, resolveActor } = setup();
  const page = { communes: [commune], nextCursor: "1602" };
  repository.listCommunes.mockResolvedValue(page);

  const response = await api.inject("/v1/communes?wilayaCode=16&cursor=1601&limit=1");

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(page);
  expect(repository.listCommunes).toHaveBeenCalledExactlyOnceWith({
    wilayaCode: 16,
    cursor: "1601",
    limit: 1,
  });
  expect(resolveActor).not.toHaveBeenCalled();
});

test("[MER-01:http] the public commune list applies its default page size", async () => {
  const { api, repository } = setup();
  repository.listCommunes.mockResolvedValue({ communes: [], nextCursor: null });
  const response = await api.inject("/v1/communes");

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ communes: [], nextCursor: null });
  expect(repository.listCommunes).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ limit: 50 }),
  );
});

test("[MER-01:http] invalid commune pagination fails before the repository call", async () => {
  const { api, repository } = setup();
  for (const query of [
    "limit=0",
    "limit=101",
    "limit=2.5",
    "wilayaCode=70",
    "cursor=bad",
    "accountId=fixture",
  ]) {
    const response = await api.inject(`/v1/communes?${query}`);
    expectProblem(response, 400, "invalid_request");
  }
  expect(repository.listCommunes).not.toHaveBeenCalled();
});

test.each(["customer", "merchant_owner", "merchant_manager", "merchant_staff"] as const)(
  "[MER-01:http] a %s can submit an application with their resolved account",
  async (role) => {
    const { api, repository } = setup({ role, accountId, sessionId });
    repository.submitApplication.mockResolvedValue({
      kind: "created",
      merchantId,
      status: "pending_review",
    });

    const response = await api.inject(applicationRequest);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ merchantId, status: "pending_review" });
    expect(repository.submitApplication).toHaveBeenCalledTimes(1);
    const [call] = repository.submitApplication.mock.calls;
    if (!call) throw new Error("Expected a submission command");
    const [{ requestHash, ...command }] = call;
    expect(command).toEqual({
      accountId,
      input: application,
      now,
      idempotencyKeyHash: keyHash,
    });
    expect(requestHash).toBeInstanceOf(Uint8Array);
    expect(requestHash).toHaveLength(32);
  },
);

test("[MER-14:http] preserves ready photo IDs in merchant application commands", async () => {
  const { api, repository } = setup(customer);
  repository.submitApplication
    .mockResolvedValueOnce({ kind: "created", merchantId, status: "pending_review" })
    .mockResolvedValueOnce({ kind: "photos_unavailable" });
  const photoIds = [merchantId];
  const request = { ...applicationRequest, payload: { ...application, photoIds } };
  expect((await api.inject(request)).statusCode).toBe(201);
  expect(repository.submitApplication.mock.calls[0]?.[0].input.photoIds).toEqual(photoIds);
  const rejected = await api.inject(request);
  expect(rejected.statusCode).toBe(409);
  expect(rejected.json()).toMatchObject({ code: "photos_unavailable" });
});

test.each([
  { actor: customer, request: applicationRequest },
  { actor: admin, request: reviewRequest },
])(
  "[AUTH-06:http] commands reject a stale or missing expected session before any write",
  async ({ actor, request }) => {
    const { api, repository } = setup(actor);
    const stale = await api.inject({
      ...request,
      headers: { ...headers, "x-expected-session-id": staleSessionId },
    });
    expectProblem(stale, 409, "session_changed");
    expect(stale.headers["set-cookie"]).toBeUndefined();
    const missing = await api.inject({
      ...request,
      headers: { "idempotency-key": idempotencyKey },
    });
    expectProblem(missing, 400, "invalid_request");
    expect(repository.submitApplication).not.toHaveBeenCalled();
    expect(repository.reviewApplication).not.toHaveBeenCalled();
  },
);

test("[MER-01:http] exact application replay retains 201 and its stable merchant ID", async () => {
  const { api, repository } = setup(customer);
  const result = { merchantId, status: "pending_review" } as const;
  repository.submitApplication
    .mockResolvedValueOnce({ ...result, kind: "created" })
    .mockResolvedValueOnce({ ...result, kind: "replayed" })
    .mockResolvedValueOnce({ kind: "idempotency_conflict" });

  const created = await api.inject(applicationRequest);
  const replayed = await api.inject(applicationRequest);
  expect(created.statusCode).toBe(201);
  expect(replayed.statusCode).toBe(201);
  expect(replayed.json()).toEqual(created.json());
  const changed = await api.inject({
    ...applicationRequest,
    payload: { ...application, ownerName: "Autre propriétaire de test" },
  });
  expectProblem(changed, 409, "idempotency_conflict");
  const [first, second, third] = repository.submitApplication.mock.calls;
  expect(first?.[0].requestHash).toHaveLength(32);
  expect(second?.[0].requestHash).toEqual(first?.[0].requestHash);
  expect(second?.[0].idempotencyKeyHash).toEqual(first?.[0].idempotencyKeyHash);
  expect(third?.[0].requestHash).not.toEqual(first?.[0].requestHash);
  expect(third?.[0].idempotencyKeyHash).toEqual(first?.[0].idempotencyKeyHash);
});

test.each([
  [undefined, 401, "unauthenticated"],
  [admin, 403, "forbidden"],
  [{ role: "courier", accountId, sessionId }, 403, "forbidden"],
] as const)("[AUTH-06:http] application rejects actor %j with %i", async (actor, status, code) => {
  const { api, repository } = setup(actor);
  expectProblem(await api.inject(applicationRequest), status, code);
  expect(repository.submitApplication).not.toHaveBeenCalled();
});

test("[MER-01:http] signup rejects missing keys, malformed bodies and injected account data", async () => {
  const { api, repository } = setup(customer);
  expectProblem(await api.inject({ ...applicationRequest, headers: {} }), 400, "invalid_request");
  expectProblem(
    await api.inject({
      ...applicationRequest,
      headers: { ...headers, "idempotency-key": "invalid key" },
    }),
    400,
    "invalid_request",
  );
  for (const fields of [
    { phone: "+213500000000" },
    { phoneE164: "+213500000000" },
    { accountId: otherAccountId },
    { ownerId: otherAccountId },
    { status: "active" },
    { pin: { latitude: 91, longitude: 3.0562 } },
    { cuisines: [] },
  ]) {
    const response = await api.inject({
      ...applicationRequest,
      payload: { ...application, ...fields },
    });
    expectProblem(response, 400, "invalid_request");
  }
  expect(repository.submitApplication).not.toHaveBeenCalled();
});

test.each([
  ["account_unavailable", 403],
  ["invalid_commune", 422],
  ["outside_commune", 422],
  ["idempotency_conflict", 409],
] as const)("[MER-01:http] signup maps %s to %i", async (kind, status) => {
  const { api, repository } = setup(customer);
  repository.submitApplication.mockResolvedValue({ kind });
  expectProblem(await api.inject(applicationRequest), status, kind);
});

test("[MER-02:http] membership listing is scoped to the resolved account", async () => {
  const { api, repository } = setup(customer);
  const memberships = [
    {
      merchantId,
      restaurantName: application.restaurantName,
      status: "pending_review",
      role: "owner",
    },
  ] as const;
  repository.listMemberships.mockResolvedValue([...memberships]);
  const response = await api.inject({
    url: membershipsPath,
    headers: { "x-account-id": otherAccountId },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ sessionId, memberships });
  expect(repository.listMemberships).toHaveBeenCalledExactlyOnceWith({ accountId });
});

test("[MER-02:http] anonymous users cannot read memberships", async () => {
  const { api, repository } = setup();
  expectProblem(await api.inject(membershipsPath), 401, "unauthenticated");
  expect(repository.listMemberships).not.toHaveBeenCalled();
});

test.each([
  [undefined, 401, "unauthenticated"],
  [customer, 403, "forbidden"],
  [{ role: "merchant_owner", accountId, sessionId }, 403, "forbidden"],
] as const)(
  "[ADM-03:http] queue and review reject non-admin actor %j with %i",
  async (actor, status, code) => {
    const { api, repository } = setup(actor);
    expectProblem(await api.inject(queuePath), status, code);
    expectProblem(await api.inject(reviewRequest), status, code);
    expect(repository.listPendingApplications).not.toHaveBeenCalled();
    expect(repository.reviewApplication).not.toHaveBeenCalled();
  },
);

test("[ADM-03:http] the admin queue decodes a compound keyset cursor and returns its page", async () => {
  const { api, repository } = setup(admin);
  const submittedAt = "2026-11-07T11:00:00.000Z";
  const previousId = "01932f18-3150-7c33-8a7a-53acfd343006";
  const previousCursor = `${submittedAt}~${previousId}`;
  const page = {
    applications: [
      {
        merchantId,
        restaurantName: application.restaurantName,
        ownerName: application.ownerName,
        phoneE164: "+213500000000",
        commune: { id: commune.id, nameAr: commune.nameAr, nameFr: commune.nameFr },
        pin: application.pin,
        cuisines: application.cuisines,
        rcNumber: application.rcNumber,
        submittedAt,
      },
    ],
    nextCursor: `${submittedAt}~${merchantId}`,
  };
  repository.listPendingApplications.mockResolvedValue(page);

  const response = await api.inject(
    `${queuePath}?cursor=${encodeURIComponent(previousCursor)}&limit=1`,
  );

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ ...page, sessionId });
  expect(repository.listPendingApplications).toHaveBeenCalledExactlyOnceWith({
    adminUserId,
    cursor: { submittedAt, merchantId: previousId },
    limit: 1,
  });
});

test("[ADM-03:http] the queue rejects an invalid cursor and a limit above 100", async () => {
  const { api, repository } = setup(admin);
  for (const query of ["cursor=2026-11-07T11:00:00.000Z~bad", "limit=101", "adminUserId=fixture"]) {
    expectProblem(await api.inject(`${queuePath}?${query}`), 400, "invalid_request");
  }
  expect(repository.listPendingApplications).not.toHaveBeenCalled();
});

test("[ADM-03:http] the queue respects a repository denial of stale admin access", async () => {
  const { api, repository } = setup(admin);
  repository.listPendingApplications.mockResolvedValue(undefined);
  expectProblem(await api.inject(queuePath), 403, "forbidden");
  expect(repository.listPendingApplications).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ adminUserId, limit: 50 }),
  );
});

test.each([
  ["approve", "approved"],
  ["reject", "rejected"],
] as const)(
  "[ADM-03:http] %s and exact review replay return the original %s review",
  async (decision, status) => {
    const { api, repository } = setup(admin);
    const result = { merchantId, status, reviewedAt: now };
    repository.reviewApplication
      .mockResolvedValueOnce({ ...result, kind: "reviewed" })
      .mockResolvedValueOnce({ ...result, kind: "replayed" });
    const request = { ...reviewRequest, payload: { decision, reason: " Verified fixture " } };

    for (const response of [await api.inject(request), await api.inject(request)]) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ...result, reviewedAt: now.toISOString() });
    }
    const [first, second] = repository.reviewApplication.mock.calls;
    if (!first) throw new Error("Expected a review command");
    const [{ requestHash, ...command }] = first;
    expect(command).toEqual({
      adminUserId,
      merchantId,
      decision,
      reason: "Verified fixture",
      now,
      idempotencyKeyHash: keyHash,
    });
    expect(requestHash).toBeInstanceOf(Uint8Array);
    expect(requestHash).toHaveLength(32);
    expect(second).toEqual(first);
  },
);

test("[ADM-03:http] review requires a UUID, a valid key and a strict decision body", async () => {
  const { api, repository } = setup(admin);
  for (const request of [
    { ...reviewRequest, url: `${queuePath}/bad/review` },
    { ...reviewRequest, headers: {} },
    { ...reviewRequest, headers: { ...headers, "idempotency-key": "invalid key" } },
    { ...reviewRequest, payload: { decision: "approve", reason: " " } },
    { ...reviewRequest, payload: { decision: "suspend", reason: "Fixture" } },
    { ...reviewRequest, payload: { ...reviewRequest.payload, adminUserId: otherAccountId } },
  ]) {
    expectProblem(await api.inject(request), 400, "invalid_request");
  }
  expect(repository.reviewApplication).not.toHaveBeenCalled();
});

test.each([
  ["not_found", 404],
  ["invalid_status", 409],
  ["idempotency_conflict", 409],
  ["forbidden", 403],
] as const)("[ADM-03:http] review maps %s to %i", async (kind, status) => {
  const { api, repository } = setup(admin);
  repository.reviewApplication.mockResolvedValue({ kind });
  expectProblem(await api.inject(reviewRequest), status, kind);
});

test("[MER-02:http] reads checklist progress and leaves delivery and test order unavailable", async () => {
  const { api, repository } = setup(customer);
  repository.getOnboarding.mockResolvedValue({
    merchantId,
    restaurantName: application.restaurantName,
    hasHours: true,
    itemsTowardMinimum: 5,
  });
  const response = await api.inject(onboardingPath);
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(merchantOnboardingOutput.parse(response.json())).toEqual({
    sessionId,
    merchantId,
    restaurantName: application.restaurantName,
    steps: {
      profile: "complete",
      hours: "complete",
      menu: { itemsTowardMinimum: 5, requiredItems: 5 },
      deliveryZone: "unavailable",
      testOrder: "unavailable",
    },
    canGoLive: false,
  });
  expect(repository.getOnboarding).toHaveBeenCalledExactlyOnceWith({ accountId, merchantId });
});

test("[MER-02:http] hides an unauthorized or not-yet-approved merchant checklist", async () => {
  const { api, repository } = setup(customer);
  repository.getOnboarding.mockResolvedValue(undefined);
  const unavailable = await api.inject(onboardingPath);
  expectProblem(unavailable, 404, "not_found");
  expect(unavailable.headers["cache-control"]).toBe("no-store");
  expectProblem(await api.inject("/v1/merchants/not-an-id/onboarding"), 400, "invalid_request");
  expect(repository.getOnboarding).toHaveBeenCalledTimes(1);
});

test.each([
  [undefined, 401, "unauthenticated"],
  [admin, 403, "forbidden"],
  [{ ...customer, role: "merchant_staff" }, 403, "forbidden"],
] as const)(
  "[AUTH-06:http] checklist rejects actors outside the editor role policy",
  async (actor, status, code) => {
    const { api, repository } = setup(actor);
    expectProblem(await api.inject(onboardingPath), status, code);
    expect(repository.getOnboarding).not.toHaveBeenCalled();
  },
);
