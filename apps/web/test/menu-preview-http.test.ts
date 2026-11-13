import { afterEach, expect, test, vi } from "vitest";
import { loadMenuPreview } from "../src/menu-preview/menu-preview-http";

const merchantId = "019d6abc-1234-7234-8234-123456789010";
const preview = {
  revision: 2,
  restaurantName: "Restaurant fictif",
  categories: [
    {
      categoryId: "019d6abc-1234-7234-8234-123456789011",
      names: { fr: "Plats" },
      items: [
        {
          itemId: "019d6abc-1234-7234-8234-123456789012",
          names: { fr: "Couscous fictif" },
          descriptions: { ar: "وصف تجريبي" },
          priceDzd: 650,
          tags: ["spicy"],
          isAvailable: true,
          soldOutUntil: null,
        },
      ],
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

test("[ADM-04] fetches the customer preview with same-origin cookie credentials", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(preview));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(loadMenuPreview({ merchantId, signal })).resolves.toEqual({
    kind: "ready",
    data: preview,
  });
  expect(fetch).toHaveBeenCalledWith(`/v1/merchants/${merchantId}/menu/preview`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
});

test("[ADM-04] distinguishes a signed-out reader from unavailable tenant access", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 })),
  );
  const input = { merchantId, signal: new AbortController().signal };

  await expect(loadMenuPreview(input)).resolves.toEqual({ kind: "unauthenticated" });
  await expect(loadMenuPreview(input)).resolves.toEqual({ kind: "forbidden" });
  await expect(loadMenuPreview(input)).resolves.toEqual({ kind: "forbidden" });
  await expect(loadMenuPreview(input)).resolves.toEqual({ kind: "error" });
});

test("[ADM-04] rejects a preview that leaks moderation fields or fails to load", async () => {
  const [category] = preview.categories;
  const leakedItem = { ...category?.items[0], moderationStatus: "blocked_pending_review" };
  const leaked = { ...preview, categories: [{ ...category, items: [leakedItem] }] };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(leaked))
      .mockRejectedValueOnce(new TypeError("offline")),
  );
  const input = { merchantId, signal: new AbortController().signal };

  await expect(loadMenuPreview(input)).resolves.toEqual({ kind: "error" });
  await expect(loadMenuPreview(input)).resolves.toEqual({ kind: "error" });
});
