import type { createOrderRepository } from "@zaafran/db/orders";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const customerId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const now = new Date();

test("[CUS-23:http] lists, adds and removes only the active session's favourites", async () => {
  const favourites = vi.fn<ReturnType<typeof createOrderRepository>["favourites"]>();
  const setFavourite = vi.fn<ReturnType<typeof createOrderRepository>["setFavourite"]>();
  favourites.mockResolvedValue({ restaurants: [] });
  setFavourite.mockResolvedValue("saved");
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId: customerId, sessionId }),
    favourites: { repository: { favourites, setFavourite }, now: () => now },
  });
  onTestFinished(() => api.close());
  const result = await api.inject("/v1/me/favourites");
  expect(result.statusCode).toBe(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(result.json()).toEqual({ restaurants: [] });
  expect(favourites).toHaveBeenCalledExactlyOnceWith({ customerId, sessionId, now });
  for (const method of ["PUT", "DELETE"] as const) {
    const response = await api.inject({ method, url: "/v1/me/favourites/" + merchantId });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ merchantId, isFavourite: method === "PUT" });
    expect(setFavourite).toHaveBeenLastCalledWith({
      customerId,
      sessionId,
      merchantId,
      now,
      isFavourite: method === "PUT",
    });
  }
});
