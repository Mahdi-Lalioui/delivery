import { afterEach, expect, test, vi } from "vitest";
import { loadMerchantOnboarding } from "../src/merchant-onboarding/merchant-onboarding-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const anotherMerchant = "019d6abc-1234-7234-8234-123456789002";
const setup = {
  sessionId,
  merchantId,
  restaurantName: "Restaurant fictif",
  steps: {
    profile: "complete",
    hours: "incomplete",
    menu: { itemsTowardMinimum: 3, requiredItems: 5 },
    deliveryZone: "unavailable",
    testOrder: "unavailable",
  },
  canGoLive: false,
};

afterEach(() => vi.unstubAllGlobals());

test("[MER-02] fetches persisted onboarding progress with same-origin cookie credentials", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(setup));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(loadMerchantOnboarding({ merchantId, signal })).resolves.toEqual({
    kind: "ready",
    data: setup,
  });
  expect(fetch).toHaveBeenCalledWith(`/v1/merchants/${merchantId}/onboarding`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
});

test("[MER-02] distinguishes a signed-out reader from unavailable tenant access", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 })),
  );
  const input = { merchantId, signal: new AbortController().signal };

  await expect(loadMerchantOnboarding(input)).resolves.toEqual({ kind: "unauthenticated" });
  await expect(loadMerchantOnboarding(input)).resolves.toEqual({ kind: "forbidden" });
  await expect(loadMerchantOnboarding(input)).resolves.toEqual({ kind: "forbidden" });
});

test("[MER-02] rejects progress from another restaurant and malformed readiness", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...setup, merchantId: anotherMerchant }))
      .mockResolvedValueOnce(Response.json({ ...setup, canGoLive: true }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError("Offline")),
  );
  const input = { merchantId, signal: new AbortController().signal };

  for (let attempt = 0; attempt < 4; attempt++) {
    await expect(loadMerchantOnboarding(input)).resolves.toEqual({ kind: "error" });
  }
});
