import { expect, test, vi } from "vitest";
import {
  readRestaurant,
  readRestaurantItem,
  readRestaurantItems,
} from "../src/restaurant/restaurant-http";

test("[CUS-07:http] rejects a malformed public response without exposing an editor payload", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        sessionId: "private-session",
        restaurant: { name: "Unexpected partial response" },
      }),
      { status: 200 },
    ),
  );
  const response = await readRestaurant("table-fictive", new AbortController().signal, fetcher);
  expect(response).toBeNull();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    "/v1/merchants/table-fictive",
    expect.objectContaining({
      credentials: "omit",
      cache: "no-store",
    }),
  );
});

test("[CUS-07:http] classifies a stale category cursor separately from an unavailable page", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 409 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  const signal = new AbortController().signal;
  const categoryId = "019d6abc-1234-7234-8234-123456789000";
  const cursor = "3~019d6abc-1234-7234-8234-123456789001";
  expect(
    await readRestaurantItems({ slug: "table-fictive", categoryId, cursor }, signal, fetcher),
  ).toEqual({ kind: "stale" });
  expect(await readRestaurantItems({ slug: "table-fictive", categoryId }, signal, fetcher)).toEqual(
    { kind: "error" },
  );
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    `/v1/merchants/table-fictive/categories/${categoryId}/items?limit=24`,
  );
});

test("[CUS-08:http] requests detail at the displayed category page revision and reports 409", async () => {
  const signal = new AbortController().signal;
  const itemId = "019d6abc-1234-7234-8234-123456789001";
  const dish = {
    itemId,
    names: { fr: "Chawarma" },
    descriptions: { fr: "Grillade maison" },
    priceDzd: 500,
    isAvailable: true,
    photoId: null,
    tags: [],
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ revision: 8, items: [dish], nextCursor: null }))
    .mockResolvedValueOnce(new Response(null, { status: 409 }));
  const page = await readRestaurantItems(
    { slug: "table-fictive", categoryId: "mains" },
    signal,
    fetcher,
  );
  if (page.kind !== "ready") throw new Error("Missing fixture page");
  expect(
    await readRestaurantItem(
      { slug: "table-fictive", itemId, expectedRevision: page.value.revision },
      signal,
      fetcher,
    ),
  ).toEqual({ kind: "stale" });
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    `/v1/merchants/table-fictive/items/${itemId}?expectedRevision=8`,
  );
});
