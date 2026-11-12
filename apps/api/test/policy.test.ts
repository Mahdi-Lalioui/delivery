import { Writable } from "node:stream";
import { billingSettingsDefaults } from "@zaafran/contracts/billing";
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
const staffOwnerRoles = { customer: 503, merchant_owner: 503 } as const;
const staffPath = "/v1/merchants/:merchantId/staff";
const staffRequest = "/v1/merchants/" + challengeId + "/staff";
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

const menuImportPath = "/v1/merchants/:merchantId/menu/import";
const menuImportRequest = "/v1/merchants/" + challengeId + "/menu/import";
const importPayload = {
  expectedRevision: 0,
  rows: [
    {
      external_key: "plate-001",
      category_fr: "Plats",
      name_fr: "Plat fictif",
      description_fr: "Description fictive",
      price_dzd: "450",
    },
  ],
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
  { method: "GET", url: "/v1/wilayas", expected: 503 },
  { method: "POST", url: "/v1/admin/orders/search", payload: {}, expected: adminRole },
  {
    method: "GET",
    url: "/v1/admin/orders/:orderId/timeline",
    requestUrl: "/v1/admin/orders/" + challengeId + "/timeline",
    expected: adminRole,
  },
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
  {
    method: "GET",
    url: "/v1/realtime",
    requestUrl: "/v1/realtime?topic=merchantOrders&merchantId=" + challengeId,
    expected: merchantRoles,
  },
  {
    method: "POST",
    url: "/v1/courier/invites/accept",
    payload: { inviteId: challengeId },
    expected: { customer: 503, courier: 503 },
  },
  {
    method: "GET",
    url: "/v1/courier/jobs",
    expected: { customer: 503, courier: 503 },
  },
  {
    method: "POST",
    url: "/v1/courier/positions",
    payload: {
      orderId: challengeId,
      positions: [
        {
          latitude: 36.75,
          longitude: 3.0625,
          accuracyM: 25,
          capturedAt: "2026-11-11T10:00:00.000Z",
        },
      ],
    },
    expected: { customer: 503, courier: 503 },
  },
  {
    method: "POST",
    url: "/v1/courier/presence",
    payload: { online: true },
    expected: { customer: 503, courier: 503 },
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/couriers",
    requestUrl: "/v1/merchants/" + challengeId + "/couriers",
    expected: merchantRoles,
  },
  {
    method: "POST",
    url: "/v1/merchants/:merchantId/couriers/invites",
    requestUrl: "/v1/merchants/" + challengeId + "/couriers/invites",
    payload: { phone: "+213500000021" },
    expected: staffOwnerRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/order-board",
    requestUrl: "/v1/merchants/" + challengeId + "/order-board",
    expected: merchantRoles,
  },
  {
    method: "GET",
    url: "/v1/orders/:orderId/tracking",
    requestUrl: "/v1/orders/" + challengeId + "/tracking",
    expected: { customer: 503 },
  },
  {
    method: "GET",
    url: "/v1/orders/:orderId",
    requestUrl: "/v1/orders/" + challengeId,
    expected: { ...merchantRoles, admin: 503 },
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/accept",
    requestUrl: "/v1/orders/" + challengeId + "/accept",
    payload: { expectedVersion: 1, prepMinutes: 15 },
    expected: merchantRoles,
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/reject",
    requestUrl: "/v1/orders/" + challengeId + "/reject",
    payload: { expectedVersion: 1, reason: "closed" },
    expected: merchantRoles,
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/cancel",
    requestUrl: "/v1/orders/" + challengeId + "/cancel",
    payload: { expectedVersion: 1, reason: "Cancel" },
    expected: merchantRoles,
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/ready",
    requestUrl: "/v1/orders/" + challengeId + "/ready",
    payload: { expectedVersion: 1 },
    expected: merchantRoles,
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/collect",
    requestUrl: "/v1/orders/" + challengeId + "/collect",
    payload: { expectedVersion: 1 },
    expected: merchantRoles,
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/assign",
    requestUrl: "/v1/orders/" + challengeId + "/assign",
    payload: { expectedVersion: 1, courierId: challengeId },
    expected: merchantRoles,
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/pick-up",
    requestUrl: "/v1/orders/" + challengeId + "/pick-up",
    payload: { expectedVersion: 1 },
    expected: { ...merchantRoles, courier: 503 },
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/deliver",
    requestUrl: "/v1/orders/" + challengeId + "/deliver",
    payload: { expectedVersion: 1, proof: { kind: "code", code: "1234" } },
    expected: { customer: 503, courier: 503 },
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/delivery-attempts",
    requestUrl: "/v1/orders/" + challengeId + "/delivery-attempts",
    payload: { action: "start_wait" },
    expected: { customer: 503, courier: 503 },
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/fail",
    requestUrl: "/v1/orders/" + challengeId + "/fail",
    payload: { expectedVersion: 1, reason: "Recipient unavailable" },
    expected: { customer: 503, courier: 503 },
  },
  {
    method: "POST",
    url: "/v1/orders/:orderId/force",
    requestUrl: "/v1/orders/" + challengeId + "/force",
    payload: { expectedVersion: 1, to: "cancelled", reason: "Cancel" },
    expected: adminRole,
  },
  {
    method: "POST",
    url: "/v1/orders",
    payload: { quoteId: challengeId },
    expected: { customer: 503 },
  },
  {
    method: "POST",
    url: "/v1/quotes",
    payload: {
      merchantId: challengeId,
      fulfilment: "pickup",
      timing: { kind: "asap" },
      items: [{ itemId: challengeId, quantity: 1, optionIds: [] }],
    },
    expected: { customer: 503 },
  },
  { method: "GET", url: "/v1/me/addresses", expected: { customer: 503 } },
  {
    method: "POST",
    url: "/v1/me/addresses",
    payload: { label: "Test", pin: { latitude: 36.75, longitude: 3.0625 } },
    expected: { customer: 503 },
  },
  {
    method: "PUT",
    url: "/v1/me/addresses/:addressId",
    requestUrl: `/v1/me/addresses/${challengeId}`,
    payload: { label: "Test", pin: { latitude: 36.75, longitude: 3.0625 } },
    expected: { customer: 503 },
  },
  {
    method: "DELETE",
    url: "/v1/me/addresses/:addressId",
    requestUrl: `/v1/me/addresses/${challengeId}`,
    expected: { customer: 503 },
  },
  {
    method: "POST",
    url: "/v1/me/push-subscriptions",
    payload: {
      endpoint: "https://fcm.googleapis.com/fcm/send/fixture",
      keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) },
    },
    expected: { customer: 503 },
  },
  {
    method: "DELETE",
    url: "/v1/me/push-subscriptions",
    payload: { endpoint: "https://fcm.googleapis.com/fcm/send/fixture" },
    expected: { customer: 503 },
  },
  { method: "GET", url: "/v1/push/public-key", expected: 503 },
  { method: "GET", url: "/v1/me/export", expected: { customer: 503 } },
  { method: "POST", url: "/v1/me/deletion-challenge", expected: { customer: 503 } },
  {
    method: "DELETE",
    url: "/v1/me",
    payload: { challengeId, code: "012345" },
    expected: { customer: 503 },
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
  {
    method: "GET",
    url: "/v1/media/:mediaId/preview",
    requestUrl: "/v1/media/" + challengeId + "/preview",
    expected: mediaRoles,
  },
  {
    method: "POST",
    url: "/v1/media/:mediaId/crop",
    requestUrl: "/v1/media/" + challengeId + "/crop",
    payload: { focalX: 5000, focalY: 5000, zoomPercent: 100 },
    expected: mediaRoles,
  },
  {
    method: "GET",
    url: "/v1/media/:mediaId/variants/:format/:width",
    requestUrl: "/v1/media/" + challengeId + "/variants/webp/160",
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
  {
    method: "POST",
    url: menuImportPath + "/preview",
    requestUrl: menuImportRequest + "/preview",
    payload: importPayload,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: menuImportPath + "/apply",
    requestUrl: menuImportRequest + "/apply",
    payload: { ...importPayload, previewToken: "A".repeat(43) },
    expected: menuRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/menu/preview/items",
    requestUrl: `/v1/merchants/${challengeId}/menu/preview/items?categoryId=${challengeId}`,
    expected: menuRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/menu/preview/items/:itemId",
    requestUrl: `/v1/merchants/${challengeId}/menu/preview/items/${challengeId}?expectedRevision=0`,
    expected: menuRoles,
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
    url: "/v1/merchants/:merchantId/delivery-settings",
    requestUrl: "/v1/merchants/" + challengeId + "/delivery-settings",
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: "/v1/merchants/:merchantId/delivery-settings",
    requestUrl: "/v1/merchants/" + challengeId + "/delivery-settings",
    payload: {
      pickupEnabled: true,
      deliveryEnabled: false,
      pickupMinimumDzd: 0,
      prepMinutes: 20,
      zone: null,
      expectedRevision: 0,
    },
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
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/hours/preview",
    requestUrl: "/v1/merchants/" + challengeId + "/hours/preview?schedule=regular",
    expected: menuRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/hours/pause",
    requestUrl: "/v1/merchants/" + challengeId + "/hours/pause",
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: "/v1/merchants/:merchantId/hours/pause",
    requestUrl: "/v1/merchants/" + challengeId + "/hours/pause",
    payload: { pausedUntil: null, expectedRevision: 0 },
    expected: menuRoles,
  },
  { method: "GET", url: "/v1/flags", expected: 503 },
  { method: "GET", url: "/v1/feed", expected: 503 },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/items/:itemId/photos/:mediaId/variants/:format/:width",
    requestUrl: `/v1/merchants/${challengeId}/items/${challengeId}/photos/${challengeId}/variants/webp/640`,
    expected: 503,
  },
  {
    method: "GET",
    url: "/v1/merchants/:slug",
    requestUrl: "/v1/merchants/table-fixture",
    expected: 503,
  },
  {
    method: "GET",
    url: "/v1/merchants/:slug/categories/:categoryId/items",
    requestUrl: `/v1/merchants/table-fixture/categories/${challengeId}/items`,
    expected: 503,
  },
  {
    method: "GET",
    url: "/v1/merchants/:slug/items/:itemId",
    requestUrl: `/v1/merchants/table-fixture/items/${challengeId}?expectedRevision=0`,
    expected: 503,
  },
  { method: "GET", url: "/v1/search", requestUrl: "/v1/search?q=chawarma", expected: 503 },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/profile/photos/:mediaId/variants/:format/:width",
    requestUrl: `/v1/merchants/${challengeId}/profile/photos/${challengeId}/variants/webp/320`,
    expected: 503,
  },
  {
    method: "POST",
    url: "/v1/geo/serviceability",
    payload: { kind: "point", latitude: 36.76, longitude: 3.05 },
    expected: 503,
  },
  {
    method: "GET",
    url: "/v1/ramadan/today",
    requestUrl: "/v1/ramadan/today?communeId=" + challengeId,
    expected: 503,
  },
  { method: "GET", url: "/v1/admin/settings", expected: adminRole },
  {
    method: "PUT",
    url: "/v1/admin/settings/:key",
    requestUrl: "/v1/admin/settings/order_accept_timeout_seconds",
    payload: { value: 480, reason: "Synthetic review" },
    expected: adminRole,
  },
  {
    method: "PUT",
    url: "/v1/admin/flags/:key",
    requestUrl: "/v1/admin/flags/ramadan_mode",
    payload: { isEnabled: true, reason: "Synthetic review" },
    expected: adminRole,
  },
  { method: "GET", url: "/v1/admin/audit", expected: adminRole },
  { method: "GET", url: "/v1/admin/billing/subscriptions", expected: adminRole },
  { method: "GET", url: "/v1/admin/billing/invoices", expected: adminRole },
  { method: "GET", url: "/v1/admin/billing/transfer-proofs", expected: adminRole },
  { method: "GET", url: "/v1/admin/billing/settings", expected: adminRole },
  {
    method: "PUT",
    url: "/v1/admin/billing/settings",
    payload: { settings: billingSettingsDefaults, reason: "Synthetic review" },
    expected: adminRole,
  },
  {
    method: "POST",
    url: "/v1/admin/billing/merchants/:merchantId/invoices",
    requestUrl: `/v1/admin/billing/merchants/${challengeId}/invoices`,
    payload: {
      period: { startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" },
      reason: "Synthetic review",
    },
    expected: adminRole,
  },
  {
    method: "POST",
    url: "/v1/admin/billing/invoices/:invoiceId/void",
    requestUrl: `/v1/admin/billing/invoices/${challengeId}/void`,
    payload: { reason: "Synthetic review" },
    expected: adminRole,
  },
  {
    method: "POST",
    url: "/v1/admin/billing/invoices/:invoiceId/payments",
    requestUrl: `/v1/admin/billing/invoices/${challengeId}/payments`,
    payload: {
      source: "manual",
      method: "cash",
      reference: "Synthetic payment",
      proofMediaId: challengeId,
      amountDzd: 5_000,
      reason: "Synthetic review",
    },
    expected: adminRole,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/billing",
    requestUrl: `/v1/merchants/${challengeId}/billing`,
    expected: staffOwnerRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/invoices",
    requestUrl: `/v1/merchants/${challengeId}/invoices`,
    expected: staffOwnerRoles,
  },
  { method: "GET", url: "/v1/admin/merchant-applications", expected: adminRole },
  { method: "GET", url: "/v1/admin/merchant-applications/notice", expected: adminRole },
  {
    method: "POST",
    url: "/v1/admin/merchant-applications/:merchantId/review",
    requestUrl: `/v1/admin/merchant-applications/${challengeId}/review`,
    payload: { decision: "approve", reason: "Synthetic review" },
    expected: adminRole,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/profile/photos",
    requestUrl: `/v1/merchants/${challengeId}/profile/photos`,
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: "/v1/merchants/:merchantId/profile/photos",
    requestUrl: `/v1/merchants/${challengeId}/profile/photos`,
    payload: { coverPhotoId: null, logoPhotoId: null, expectedRevision: 0 },
    expected: menuRoles,
  },
  {
    method: "GET",
    url: "/v1/merchants/:merchantId/promotions",
    requestUrl: `/v1/merchants/${challengeId}/promotions`,
    expected: menuRoles,
  },
  {
    method: "POST",
    url: "/v1/merchants/:merchantId/promotions",
    requestUrl: `/v1/merchants/${challengeId}/promotions`,
    payload: {
      activation: { kind: "automatic" },
      discount: { kind: "fixed", amountDzd: 5 },
      conditions: {},
    },
    expected: menuRoles,
  },
  {
    method: "PUT",
    url: "/v1/merchants/:merchantId/promotions/:promotionId",
    requestUrl: `/v1/merchants/${challengeId}/promotions/${challengeId}`,
    payload: {
      activation: { kind: "automatic" },
      discount: { kind: "fixed", amountDzd: 5 },
      conditions: {},
    },
    expected: menuRoles,
  },
  { method: "GET", url: staffPath, requestUrl: staffRequest, expected: staffOwnerRoles },
  {
    method: "POST",
    url: staffPath + "/invitations",
    requestUrl: staffRequest + "/invitations",
    payload: { phone: "+213550000301", role: "staff" },
    expected: staffOwnerRoles,
  },
  {
    method: "POST",
    url: staffPath + "/invitations/:invitationId/revoke",
    requestUrl: staffRequest + "/invitations/" + challengeId + "/revoke",
    expected: staffOwnerRoles,
  },
  {
    method: "POST",
    url: "/v1/staff-invitations/accept",
    payload: { token: "A".repeat(42) + "E" },
    expected: merchantRoles,
  },
  { method: "GET", url: "/v1/admin/menu-items/held", expected: adminRole },
  {
    method: "POST",
    url: "/v1/admin/menu-items/:itemId/review",
    requestUrl: `/v1/admin/menu-items/${challengeId}/review`,
    payload: { decision: "reject", reason: "Synthetic review" },
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
      for (const [routeIndex, { method, url, requestUrl, payload, expected }] of matrix.entries()) {
        const response = await api.inject({
          method,
          url: requestUrl ?? url,
          remoteAddress: `198.18.${String(index)}.${String(routeIndex + 1)}`,
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
