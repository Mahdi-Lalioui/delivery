import { afterEach, expect, test, vi } from "vitest";
import { prepareMerchantAttempt } from "../src/merchant/merchant-application";
import {
  listAlgiersCommunes,
  listMerchantMemberships,
  submitMerchantApplication,
} from "../src/merchant/merchant-http";

const commune = {
  id: "019d6abc-1234-7234-8234-123456789abc",
  code: "1601",
  wilayaCode: 16,
  nameAr: "الجزائر الوسطى",
  nameFr: "Alger centre",
};
const merchantId = "019d6abc-1234-7234-8234-123456789def";
const sessionId = "019d6abc-1234-7234-8234-123456789000";
const application = {
  restaurantName: "Restaurant fictif",
  ownerName: "Propriétaire fictif",
  communeId: commune.id,
  pin: { latitude: 36.7666581, longitude: 3.0574036 },
  cuisines: ["algerian", "grill"],
};

afterEach(() => vi.unstubAllGlobals());

test("[MER-01] loads bounded Algiers commune pages with the public same-origin endpoint", async () => {
  const second = { ...commune, id: merchantId, code: "1602" };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ communes: [commune], nextCursor: "1601" }))
    .mockResolvedValueOnce(Response.json({ communes: [second], nextCursor: null }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(listAlgiersCommunes(signal)).resolves.toEqual({
    kind: "ready",
    data: [commune, second],
  });
  for (const [call, url] of [
    [1, "/v1/communes?wilayaCode=16&limit=100"],
    [2, "/v1/communes?wilayaCode=16&limit=100&cursor=1601"],
  ] as const) {
    expect(fetch).toHaveBeenNthCalledWith(
      call,
      url,
      expect.objectContaining({ method: "GET", credentials: "same-origin", signal }),
    );
  }
});

test("[MER-01] only reads the current account's persisted roles and statuses", async () => {
  const memberships = [
    { merchantId, restaurantName: "Restaurant fictif", role: "owner", status: "approved" },
  ];
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ sessionId, memberships }))
    .mockResolvedValueOnce(Response.json({ memberships }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(listMerchantMemberships(signal)).resolves.toEqual({
    kind: "ready",
    data: { sessionId, memberships },
  });
  await expect(listMerchantMemberships(signal)).resolves.toEqual({ kind: "error" });
  await expect(listMerchantMemberships(signal)).resolves.toEqual({ kind: "unauthenticated" });
  await expect(listMerchantMemberships(signal)).resolves.toEqual({ kind: "forbidden" });
  expect(fetch).toHaveBeenCalledWith("/v1/me/merchants", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
});

test("[MER-01] submits the pin and merchant fields using the verified session without a phone in the body", async () => {
  const data = { merchantId, status: "pending_review" };
  const fetch = vi.fn().mockResolvedValue(Response.json(data, { status: 201 }));
  vi.stubGlobal("fetch", fetch);

  await expect(
    submitMerchantApplication({
      application,
      expectedSessionId: sessionId,
      idempotencyKey: "application-first",
    }),
  ).resolves.toEqual({
    kind: "created",
    data,
  });
  expect(fetch).toHaveBeenCalledWith("/v1/merchant-applications", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "application-first",
      "x-expected-session-id": sessionId,
    },
    body: JSON.stringify(application),
  });
});

test("[MER-01] reports PostGIS pin rejection and distinguishes retryable delivery uncertainty", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        {
          type: "about:blank",
          title: "Outside commune",
          status: 422,
          code: "outside_commune",
          requestId: "merchant-test",
        },
        { status: 422 },
      ),
    )
    .mockRejectedValueOnce(new TypeError("Offline"))
    .mockResolvedValueOnce(Response.json({ merchantId }, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  const attempt = {
    application,
    expectedSessionId: sessionId,
    idempotencyKey: "application-first",
  };

  await expect(submitMerchantApplication(attempt)).resolves.toEqual({
    kind: "error",
    error: "outsideCommune",
    shouldReuseKey: false,
  });
  for (let retry = 0; retry < 2; retry++) {
    await expect(submitMerchantApplication(attempt)).resolves.toEqual({
      kind: "error",
      error: "submitError",
      shouldReuseKey: true,
    });
  }
});

test("[MER-01] an account switch is distinct from other application conflicts", async () => {
  const problem = {
    type: "about:blank",
    title: "Conflict",
    status: 409,
    requestId: "merchant-test",
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...problem, code: "session_changed" }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...problem, code: "idempotency_conflict" }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json({ code: "session_changed" }, { status: 409 })),
  );
  const attempt = {
    application,
    expectedSessionId: sessionId,
    idempotencyKey: "application-first",
  };

  await expect(submitMerchantApplication(attempt)).resolves.toEqual({ kind: "session-changed" });
  for (let retry = 0; retry < 2; retry++) {
    await expect(submitMerchantApplication(attempt)).resolves.toEqual({
      kind: "error",
      error: "submitError",
      shouldReuseKey: false,
    });
  }
});

test("[MER-01] a lost committed response followed by rate limiting keeps the original command key", async () => {
  let committedKey: string | null = null;
  const receipt = { merchantId, status: "pending_review" };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementationOnce((_path, options) => {
      committedKey = new Headers(options?.headers).get("idempotency-key");
      return Promise.reject(new TypeError("Connection lost after the application was recorded"));
    })
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockImplementationOnce((_path, options) => {
      const key = new Headers(options?.headers).get("idempotency-key");
      return Promise.resolve(
        Response.json(
          { ...receipt, merchantId: key === committedKey ? merchantId : commune.id },
          { status: 201 },
        ),
      );
    });
  vi.stubGlobal("fetch", fetch);

  let attempt = prepareMerchantAttempt(application);
  for (const error of ["submitError", "rateLimited"]) {
    const failure = await submitMerchantApplication({ ...attempt, expectedSessionId: sessionId });
    expect(failure).toEqual({ kind: "error", error, shouldReuseKey: true });
    attempt = prepareMerchantAttempt(
      application,
      failure.kind === "error" && failure.shouldReuseKey ? attempt : undefined,
    );
  }

  await expect(
    submitMerchantApplication({ ...attempt, expectedSessionId: sessionId }),
  ).resolves.toEqual({
    kind: "created",
    data: receipt,
  });
  expect(
    fetch.mock.calls.map(([, options]) => new Headers(options?.headers).get("idempotency-key")),
  ).toEqual([committedKey, committedKey, committedKey]);
});
