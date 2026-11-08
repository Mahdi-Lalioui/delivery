import { Writable } from "node:stream";
import { expect, test } from "vitest";
import { createApi } from "../src/app.ts";
import { listRoutes, type Actor } from "../src/policy.ts";

const challengeId = "01932f18-3150-7c33-8a7a-53acfd343001";

const actors: Readonly<Record<string, Actor | undefined>> = {
  anonymous: undefined,
  customerA: { role: "customer", accountId: "customer-a", sessionId: challengeId },
  customerB: { role: "customer", accountId: "customer-b", sessionId: challengeId },
  merchantOwnerA: { role: "merchant_owner", accountId: "merchant-owner-a", sessionId: challengeId },
  merchantManagerA: {
    role: "merchant_manager",
    accountId: "merchant-manager-a",
    sessionId: challengeId,
  },
  merchantStaffA: { role: "merchant_staff", accountId: "merchant-staff-a", sessionId: challengeId },
  merchantOwnerB: { role: "merchant_owner", accountId: "merchant-owner-b", sessionId: challengeId },
  courierA: { role: "courier", accountId: "courier-a", sessionId: challengeId },
  courierB: { role: "courier", accountId: "courier-b", sessionId: challengeId },
  admin: { role: "admin", accountId: "admin", sessionId: challengeId },
};

function createPolicyTestApi(resolveActor: () => Actor | undefined = () => undefined) {
  return createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(resolveActor()),
    logStream: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });
}

test("[AUTH-06] refuses to register a route without an explicit policy", async () => {
  const api = createPolicyTestApi();
  try {
    expect(() => api.get("/undeclared", () => ({ status: "ok" }))).toThrow(/policy/i);
  } finally {
    await api.close();
  }
});

test("[AUTH-06] denies anonymous and unlisted actors on a role-restricted route", async () => {
  let actor: Actor | undefined;
  const api = createPolicyTestApi(() => actor);
  api.get("/restricted", { config: { policy: { kind: "roles", roles: ["admin"] } } }, () => ({
    status: "ok",
  }));
  try {
    expect((await api.inject("/restricted")).statusCode).toBe(401);
    actor = actors.customerA;
    expect((await api.inject("/restricted")).statusCode).toBe(403);
    actor = actors.admin;
    expect((await api.inject("/restricted")).statusCode).toBe(200);
  } finally {
    await api.close();
  }
});

test("[AUTH-06] denies protected requests before a route hook can respond", async () => {
  let actor: Actor | undefined;
  const api = createPolicyTestApi(() => actor);
  api.get(
    "/hook-response",
    {
      config: { policy: { kind: "roles", roles: ["admin"] } },
      onRequest: (_request, reply) => {
        void reply.send({ status: "protected-response" });
      },
    },
    () => ({ status: "handler" }),
  );

  try {
    expect((await api.inject("/hook-response")).statusCode).toBe(401);
    actor = actors.customerA;
    expect((await api.inject("/hook-response")).statusCode).toBe(403);
    actor = actors.admin;
    expect((await api.inject("/hook-response")).json()).toEqual({ status: "protected-response" });
  } finally {
    await api.close();
  }
});

test("[AUTH-06] throttles protected requests before resolving an actor", async () => {
  let resolutions = 0;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    rateLimit: { max: 2, timeWindow: 60_000 },
    resolveActor: () => {
      resolutions += 1;
      return Promise.resolve(undefined);
    },
  });
  api.get("/throttled-auth", { config: { policy: { kind: "roles", roles: ["admin"] } } }, () => ({
    status: "protected",
  }));

  try {
    expect((await api.inject("/throttled-auth")).statusCode).toBe(401);
    expect((await api.inject("/throttled-auth")).statusCode).toBe(401);
    expect((await api.inject("/throttled-auth")).statusCode).toBe(429);
    expect(resolutions).toBe(2);
  } finally {
    await api.close();
  }
});

type MatrixRoute = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  requestUrl?: string;
  payload?: Record<string, unknown>;
  expected: number | Readonly<Partial<Record<Actor["role"], number>>>;
};

const verification = { challengeId, code: "001234", transport: "web" };

const merchantRoles = {
  customer: 503,
  merchant_owner: 503,
  merchant_manager: 503,
  merchant_staff: 503,
} as const;
const adminRole = { admin: 503 } as const;
const mediaRoles = { ...merchantRoles, courier: 503 } as const;
const menuRoles = { customer: 503, merchant_owner: 503, merchant_manager: 503 } as const;
const menuCategoryPath = "/v1/merchants/:merchantId/menu/categories";
const menuCategoryRequest = "/v1/merchants/" + challengeId + "/menu/categories";
const categoryPayload = { names: { fr: "Plats fictifs" }, availability: null, expectedRevision: 0 };
const menuItemPath = "/v1/merchants/:merchantId/menu/items";
const menuItemRequest = "/v1/merchants/" + challengeId + "/menu/items";
const itemRevision = { expectedRevision: 0 };
const itemPayload = {
  ...itemRevision,
  categoryId: challengeId,
  names: { fr: "Plat fictif" },
  descriptions: { fr: "Description fictive" },
  priceDzd: 750,
  photoId: null,
  tags: [],
  extraPrepMinutes: 5,
  optionGroupIds: [],
};

const menuPricePath = "/v1/merchants/:merchantId/menu/prices";
const menuPriceRequest = "/v1/merchants/" + challengeId + "/menu/prices";
const pricePreviewPayload = {
  itemIds: [challengeId],
  adjustment: { kind: "percent", basisPoints: 1_000 },
  roundingUnit: 10,
};
const priceApplyPayload = { ...pricePreviewPayload, expectedRevision: 0 };

const menuGroupPath = "/v1/merchants/:merchantId/menu/option-groups";
const menuGroupRequest = "/v1/merchants/" + challengeId + "/menu/option-groups";
const groupPayload = {
  expectedRevision: 0,
  names: { fr: "Sauces" },
  minimum: 0,
  maximum: 1,
  options: [{ names: { fr: "Épicée" }, priceDeltaDzd: 25, isDefault: true, isAvailable: false }],
};

const matrix: readonly MatrixRoute[] = [
  { method: "GET", url: "/healthz", expected: 200 },
  { method: "GET", url: "/readyz", expected: 200 },
  {
    method: "POST",
    url: "/v1/auth/otp/request",
    payload: { phone: "+213500000000", purpose: "sign_in" },
    expected: 503,
  },
  { method: "POST", url: "/v1/auth/otp/verify", payload: verification, expected: 503 },
  { method: "POST", url: "/v1/auth/totp/verify", payload: verification, expected: 503 },
  {
    method: "POST",
    url: "/v1/auth/logout",
    payload: { scope: "current", expectedSessionId: challengeId },
    expected: 401,
  },
  { method: "GET", url: "/v1/me/sessions", expected: 401 },
  {
    method: "DELETE",
    url: "/v1/me/sessions/:sessionId",
    requestUrl: `/v1/me/sessions/${challengeId}`,
    expected: 401,
  },
  { method: "GET", url: "/v1/communes", expected: 503 },
  {
    method: "POST",
    url: "/v1/merchant-applications",
    payload: {
      restaurantName: "Synthetic restaurant",
      ownerName: "Synthetic owner",
      communeId: challengeId,
      pin: { latitude: 36.7631, longitude: 3.0562 },
      cuisines: ["algerian"],
      rcNumber: "22B1234567",
    },
    expected: merchantRoles,
  },
  { method: "GET", url: "/v1/me/merchants", expected: merchantRoles },
  {
    method: "POST",
    url: "/v1/media/uploads",
    payload: { kind: "application", contentType: "image/jpeg", bytes: 120 },
    expected: mediaRoles,
  },
  {
    method: "PUT",
    url: "/v1/media/uploads/:mediaId/content",
    requestUrl: "/v1/media/uploads/" + challengeId + "/content",
    expected: mediaRoles,
  },
  {
    method: "GET",
    url: "/v1/media/:mediaId",
    requestUrl: "/v1/media/" + challengeId,
    expected: mediaRoles,
  },
  { method: "GET", url: menuCategoryPath, requestUrl: menuCategoryRequest, expected: menuRoles },
  {
    method: "POST",
    url: menuCategoryPath,
    requestUrl: menuCategoryRequest,
    payload: categoryPayload,
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: menuCategoryPath + "/:categoryId",
    requestUrl: menuCategoryRequest + "/" + challengeId,
    payload: categoryPayload,
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: menuCategoryPath + "/order",
    requestUrl: menuCategoryRequest + "/order",
    payload: { categoryIds: [challengeId], expectedRevision: 0 },
    expected: menuRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/onboarding",
    requestUrl: "/v1/merchants/" + challengeId + "/onboarding",
    expected: menuRoles,
  },
  {
    method: "GET",
    url: menuItemPath,
    requestUrl: menuItemRequest + "?categoryId=" + challengeId,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: menuItemPath,
    requestUrl: menuItemRequest,
    payload: itemPayload,
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: menuItemPath + "/:itemId",
    requestUrl: menuItemRequest + "/" + challengeId,
    payload: itemPayload,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: menuItemPath + "/:itemId/duplicate",
    requestUrl: menuItemRequest + "/" + challengeId + "/duplicate",
    payload: itemRevision,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: menuItemPath + "/:itemId/archive",
    requestUrl: menuItemRequest + "/" + challengeId + "/archive",
    payload: itemRevision,
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: menuItemPath + "/:itemId/availability",
    requestUrl: menuItemRequest + "/" + challengeId + "/availability",
    payload: { ...itemRevision, availability: "indefinite" },
    expected: { ...menuRoles, merchant_staff: 503 },
  },
  { method: "GET", url: menuGroupPath, requestUrl: menuGroupRequest, expected: menuRoles },
  {
    method: "GET",
    url: menuGroupPath + "/:optionGroupId",
    requestUrl: menuGroupRequest + "/" + challengeId,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: menuGroupPath,
    requestUrl: menuGroupRequest,
    payload: groupPayload,
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: menuGroupPath + "/:optionGroupId",
    requestUrl: menuGroupRequest + "/" + challengeId,
    payload: groupPayload,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: menuPricePath + "/preview",
    requestUrl: menuPriceRequest + "/preview",
    payload: pricePreviewPayload,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: menuPricePath + "/apply",
    requestUrl: menuPriceRequest + "/apply",
    payload: priceApplyPayload,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: menuPricePath + "/batches/:batchId/undo",
    requestUrl: menuPriceRequest + "/batches/" + challengeId + "/undo",
    payload: { expectedRevision: 0 },
    expected: menuRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/hours",
    requestUrl: "/v1/merchants/" + challengeId + "/hours",
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: "/v1/merchants/:merchantId/hours",
    requestUrl: "/v1/merchants/" + challengeId + "/hours",
    payload: {
      weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] })),
      specialDates: [],
      expectedRevision: 0,
    },
    expected: menuRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/hours/ramadan",
    requestUrl: "/v1/merchants/" + challengeId + "/hours/ramadan",
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: "/v1/merchants/:merchantId/hours/ramadan",
    requestUrl: "/v1/merchants/" + challengeId + "/hours/ramadan",
    payload: {
      weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, ranges: [] })),
      suhoor: null,
      method: "Algeria",
      adjustmentMinutes: 0,
      expectedRevision: 0,
    },
    expected: menuRoles,
  },
  { method: "GET", url: "/v1/admin/merchant-applications", expected: adminRole },
  {
    method: "POST",
    url: "/v1/admin/merchant-applications/:merchantId/review",
    requestUrl: `/v1/admin/merchant-applications/${challengeId}/review`,
    payload: { decision: "approve", reason: "Synthetic review" },
    expected: adminRole,
  },
];

test("[AUTH-08] covers every registered route for every required actor", async () => {
  let actor: Actor | undefined;
  const api = createPolicyTestApi(() => actor);
  try {
    await api.ready();
    expect(
      listRoutes(api)
        .map(({ method, url }) => method + " " + url)
        .sort(),
    ).toEqual(matrix.map(({ method, url }) => method + " " + url).sort());
    for (const [index, [label, candidate]] of Object.entries(actors).entries()) {
      actor = candidate;
      for (const { method, url, requestUrl, payload, expected } of matrix) {
        const response = await api.inject({
          method,
          url: requestUrl ?? url,
          remoteAddress: `192.0.2.${String(index + 1)}`,
          headers: { "idempotency-key": "fixture-policy", "x-expected-session-id": challengeId },
          ...(payload === undefined ? {} : { payload }),
        });
        const status =
          typeof expected === "number"
            ? expected
            : candidate
              ? (expected[candidate.role] ?? 403)
              : 401;
        expect(response.statusCode, method + " " + url + " for " + label).toBe(status);
      }
    }
  } finally {
    await api.close();
  }
});
