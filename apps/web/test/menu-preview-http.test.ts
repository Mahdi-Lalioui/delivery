import { afterEach, expect, test, vi } from "vitest";
import {
  mergePreviewPages,
  readMenuPreviewDetail,
  readMenuPreviewPage,
  type PreviewItem,
} from "../src/menu-item/menu-preview-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const categoryId = "019d6abc-1234-7234-8234-123456789001";
const itemId = "019d6abc-1234-7234-8234-123456789002";
const sessionId = "019d6abc-1234-7234-8234-123456789003";
const otherItemId = "019d6abc-1234-7234-8234-123456789004";
const otherSessionId = "019d6abc-1234-7234-8234-123456789005";
const expected = { sessionId, revision: 8 };
const signal = new AbortController().signal;
const scope = { merchantId, expected, signal };
const item: PreviewItem = {
  itemId,
  names: { fr: "Plat" },
  descriptions: { fr: "Description" },
  priceDzd: 1250,
  photoId: null,
  tags: ["spicy"],
  isAvailable: true,
};
const cursor = `8~${itemId}`;
const page = {
  ...expected,
  items: [item],
  context: { restaurantName: "Restaurant", categoryNames: { fr: "Déjeuner" } },
  nextCursor: cursor,
};

afterEach(() => vi.unstubAllGlobals());

test("[ADM-04] loads a private page with the selected category and an opaque cursor", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(page));
  vi.stubGlobal("fetch", fetch);

  await expect(readMenuPreviewPage({ ...scope, categoryId, cursor })).resolves.toEqual({
    kind: "ready",
    data: page,
  });
  const [path, init] = fetch.mock.calls[0] ?? [];
  if (typeof path !== "string") throw new Error("Expected a relative preview URL");
  const url = new URL(path, "https://example.test");
  expect(url.pathname).toBe(`/v1/merchants/${merchantId}/menu/preview/items`);
  expect(url.searchParams.get("categoryId")).toBe(categoryId);
  expect(url.searchParams.get("cursor")).toBe(cursor);
  expect(init).toMatchObject({
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
});

test.each([
  [{ sessionId: otherSessionId }, "session-changed"],
  [{ revision: 9, nextCursor: null }, "revision-conflict"],
])("[ADM-04] discards a page when the response scope changes (%s)", async (patch, kind) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...page, ...patch })));
  await expect(readMenuPreviewPage({ ...scope, categoryId })).resolves.toEqual({ kind });
});

test("[ADM-04] scopes on-demand item details to the current revision and exact item ID", async () => {
  const detail = { ...expected, item, optionGroups: [] };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json(detail))
    .mockResolvedValueOnce(Response.json({ ...detail, item: { ...item, itemId: otherItemId } }));
  vi.stubGlobal("fetch", fetch);

  await expect(readMenuPreviewDetail({ ...scope, itemId })).resolves.toEqual({
    kind: "ready",
    data: detail,
  });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    `/v1/merchants/${merchantId}/menu/preview/items/${itemId}?expectedRevision=8`,
  );
  await expect(readMenuPreviewDetail({ ...scope, itemId })).resolves.toEqual({ kind: "error" });
});

test.each([
  [401, "authentication_required", "sign-in"],
  [403, "forbidden", "forbidden"],
  [404, "not_found", "forbidden"],
  [409, "revision_conflict", "revision-conflict"],
  [409, "session_changed", "session-changed"],
  [503, "service_unavailable", "error"],
])("[ADM-04] maps private read failure %i %s", async (status, code, kind) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          status,
          code,
          type: "https://example.test/problem",
          title: "Failed",
          requestId: "test",
        },
        { status },
      ),
    ),
  );
  await expect(readMenuPreviewPage({ ...scope, categoryId })).resolves.toEqual({ kind });
});

test("[ADM-04] appends a page in server order and rejects repeated items or cursors", () => {
  const next = { ...page, items: [{ ...item, itemId: otherItemId }], nextCursor: null };
  expect(mergePreviewPages(page, next)?.items.map((entry) => entry.itemId)).toEqual([
    itemId,
    otherItemId,
  ]);
  expect(mergePreviewPages(page, { ...next, items: [item] })).toBeUndefined();
  expect(mergePreviewPages(page, { ...next, nextCursor: cursor })).toBeUndefined();
});
