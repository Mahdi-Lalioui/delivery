import { Writable } from "node:stream";
import {
  healthResponseSchema,
  problemResponseSchema,
  readyResponseSchema,
} from "@zaafran/contracts/health";
import { expect, test } from "vitest";
import { createApi } from "../src/app.ts";

test("[M0-6] liveness responds even when readiness cannot reach its dependencies", async () => {
  const failure = "private database failure fixture";
  const api = createApi({
    checkReadiness: () => Promise.reject(new Error(failure)),
    logStream: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });

  try {
    const health = await api.inject("/healthz");
    expect(health.statusCode).toBe(200);
    expect(healthResponseSchema.parse(health.json())).toEqual({ status: "ok" });

    const readiness = await api.inject({
      url: "/readyz",
      headers: { "x-request-id": "probe-503" },
    });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    expect(readiness.headers["x-request-id"]).toBe("probe-503");
    expect(problemResponseSchema.parse(readiness.json())).toMatchObject({
      status: 503,
      code: "not_ready",
      requestId: "probe-503",
    });
    expect(readiness.body).not.toContain(failure);
  } finally {
    await api.close();
  }
});

test("[M0-6] readiness returns its contract and replaces an invalid request ID", async () => {
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    logStream: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });

  try {
    const reply = await api.inject({ url: "/readyz", headers: { "x-request-id": "two words" } });
    expect(reply.statusCode).toBe(200);
    expect(readyResponseSchema.parse(reply.json())).toEqual({ status: "ready" });
    expect(reply.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  } finally {
    await api.close();
  }
});

test("[M0-6] rate limits repeated requests with a problem response", async () => {
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    rateLimit: { max: 2, timeWindow: 60_000 },
    logStream: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });

  try {
    expect((await api.inject("/healthz")).statusCode).toBe(200);
    expect((await api.inject("/healthz")).statusCode).toBe(200);
    const limited = await api.inject({ url: "/healthz", headers: { "x-request-id": "limited" } });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    expect(problemResponseSchema.parse(limited.json())).toMatchObject({
      status: 429,
      code: "rate_limited",
      requestId: "limited",
    });
  } finally {
    await api.close();
  }
});

test("[M0-6] structured logging redacts personal fields while preserving correlation IDs", async () => {
  const logs: string[] = [];
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    logStream: new Writable({
      write(chunk, _encoding, done) {
        logs.push(String(chunk));
        done();
      },
    }),
  });
  const fixture = {
    requestId: "synthetic-request",
    orderId: "synthetic-order",
    merchantId: "synthetic-merchant",
    phone: "fixture-phone",
    code: "fixture-code",
    token: "fixture-token",
    address: { landmark: "fixture-landmark" },
    location: { label: "fixture-location" },
  };

  try {
    api.log.info(fixture, "redaction check");
    const output = logs.join("");
    const line: unknown = JSON.parse(output.trim());
    expect(line).toMatchObject({
      requestId: "synthetic-request",
      orderId: "synthetic-order",
      merchantId: "synthetic-merchant",
    });
    for (const value of ["phone", "code", "token", "landmark", "location"]) {
      expect(output).not.toContain("fixture-" + value);
    }
  } finally {
    await api.close();
  }
});

test("[M0-6] the generated OpenAPI document describes the readiness problem response", async () => {
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    logStream: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });

  try {
    await api.ready();
    const schema = api.swagger();
    expect(Object.keys(schema.paths ?? {}).sort()).toEqual([
      "/healthz",
      "/readyz",
      "/v1/admin/audit",
      "/v1/admin/billing/invoices",
      "/v1/admin/billing/invoices/{invoiceId}/payments",
      "/v1/admin/billing/invoices/{invoiceId}/void",
      "/v1/admin/billing/merchants/{merchantId}/invoices",
      "/v1/admin/billing/settings",
      "/v1/admin/billing/subscriptions",
      "/v1/admin/billing/transfer-proofs",
      "/v1/admin/flags/{key}",
      "/v1/admin/menu-items/held",
      "/v1/admin/menu-items/{itemId}/review",
      "/v1/admin/merchant-applications",
      "/v1/admin/merchant-applications/notice",
      "/v1/admin/merchant-applications/{merchantId}/review",
      "/v1/admin/orders/search",
      "/v1/admin/orders/{orderId}/timeline",
      "/v1/admin/settings",
      "/v1/admin/settings/{key}",
      "/v1/auth/logout",
      "/v1/auth/otp/request",
      "/v1/auth/otp/verify",
      "/v1/auth/totp/verify",
      "/v1/communes",
      "/v1/courier/invites/accept",
      "/v1/courier/jobs",
      "/v1/courier/positions",
      "/v1/courier/presence",
      "/v1/feed",
      "/v1/flags",
      "/v1/geo/serviceability",
      "/v1/me",
      "/v1/me/addresses",
      "/v1/me/addresses/{addressId}",
      "/v1/me/deletion-challenge",
      "/v1/me/export",
      "/v1/me/merchants",
      "/v1/me/orders",
      "/v1/me/orders/{orderId}/receipt",
      "/v1/me/push-subscriptions",
      "/v1/me/sessions",
      "/v1/me/sessions/{sessionId}",
      "/v1/media/uploads",
      "/v1/media/uploads/{mediaId}/content",
      "/v1/media/{mediaId}",
      "/v1/media/{mediaId}/crop",
      "/v1/media/{mediaId}/preview",
      "/v1/media/{mediaId}/variants/{format}/{width}",
      "/v1/merchant-applications",
      "/v1/merchants/{merchantId}/billing",
      "/v1/merchants/{merchantId}/couriers",
      "/v1/merchants/{merchantId}/couriers/invites",
      "/v1/merchants/{merchantId}/delivery-settings",
      "/v1/merchants/{merchantId}/hours",
      "/v1/merchants/{merchantId}/hours/pause",
      "/v1/merchants/{merchantId}/hours/preview",
      "/v1/merchants/{merchantId}/hours/ramadan",
      "/v1/merchants/{merchantId}/invoices",
      "/v1/merchants/{merchantId}/items/{itemId}/photos/{mediaId}/variants/{format}/{width}",
      "/v1/merchants/{merchantId}/menu/categories",
      "/v1/merchants/{merchantId}/menu/categories/order",
      "/v1/merchants/{merchantId}/menu/categories/{categoryId}",
      "/v1/merchants/{merchantId}/menu/import/apply",
      "/v1/merchants/{merchantId}/menu/import/preview",
      "/v1/merchants/{merchantId}/menu/items",
      "/v1/merchants/{merchantId}/menu/items/{itemId}",
      "/v1/merchants/{merchantId}/menu/items/{itemId}/archive",
      "/v1/merchants/{merchantId}/menu/items/{itemId}/availability",
      "/v1/merchants/{merchantId}/menu/items/{itemId}/duplicate",
      "/v1/merchants/{merchantId}/menu/option-groups",
      "/v1/merchants/{merchantId}/menu/option-groups/{optionGroupId}",
      "/v1/merchants/{merchantId}/menu/preview/items",
      "/v1/merchants/{merchantId}/menu/preview/items/{itemId}",
      "/v1/merchants/{merchantId}/menu/prices/apply",
      "/v1/merchants/{merchantId}/menu/prices/batches/{batchId}/undo",
      "/v1/merchants/{merchantId}/menu/prices/preview",
      "/v1/merchants/{merchantId}/onboarding",
      "/v1/merchants/{merchantId}/order-board",
      "/v1/merchants/{merchantId}/profile/photos",
      "/v1/merchants/{merchantId}/profile/photos/{mediaId}/variants/{format}/{width}",
      "/v1/merchants/{merchantId}/promotions",
      "/v1/merchants/{merchantId}/promotions/{promotionId}",
      "/v1/merchants/{merchantId}/staff",
      "/v1/merchants/{merchantId}/staff/invitations",
      "/v1/merchants/{merchantId}/staff/invitations/{invitationId}/revoke",
      "/v1/merchants/{slug}",
      "/v1/merchants/{slug}/categories/{categoryId}/items",
      "/v1/merchants/{slug}/items/{itemId}",
      "/v1/orders",
      "/v1/orders/{orderId}",
      "/v1/orders/{orderId}/accept",
      "/v1/orders/{orderId}/assign",
      "/v1/orders/{orderId}/cancel",
      "/v1/orders/{orderId}/collect",
      "/v1/orders/{orderId}/deliver",
      "/v1/orders/{orderId}/delivery-attempts",
      "/v1/orders/{orderId}/fail",
      "/v1/orders/{orderId}/force",
      "/v1/orders/{orderId}/pick-up",
      "/v1/orders/{orderId}/rating",
      "/v1/orders/{orderId}/ready",
      "/v1/orders/{orderId}/reject",
      "/v1/orders/{orderId}/tracking",
      "/v1/push/public-key",
      "/v1/quotes",
      "/v1/ramadan/today",
      "/v1/realtime",
      "/v1/search",
      "/v1/staff-invitations/accept",
      "/v1/wilayas",
    ]);
    expect(schema.paths?.["/v1/media/{mediaId}/preview"]?.get?.responses).toMatchObject({
      200: { content: { "image/webp": { schema: { type: "string", format: "binary" } } } },
    });
    expect(schema.paths?.["/readyz"]?.get?.responses).toMatchObject({
      503: { content: { "application/problem+json": { schema: { type: "object" } } } },
    });
  } finally {
    await api.close();
  }
});
