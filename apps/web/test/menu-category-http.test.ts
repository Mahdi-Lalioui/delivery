import { afterEach, expect, test, vi } from "vitest";
import {
  listMenuCategories,
  saveMenuCategory,
  saveMenuCategoryOrder,
} from "../src/menu-category/menu-category-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const otherSession = "019d6abc-1234-7234-8234-123456789002";
const category = {
  categoryId: "019d6abc-1234-7234-8234-123456789003",
  names: { fr: "Petit déjeuner" },
  availability: { from: "21:00", to: "03:00" },
  position: 0,
};
const second = { ...category, categoryId: "019d6abc-1234-7234-8234-123456789004", position: 1 };
const cursor = `3~0~${category.categoryId}`;
const endpoint = `/v1/merchants/${merchantId}/menu/categories`;
const input = { names: category.names, availability: category.availability, expectedRevision: 3 };
const identity = { merchantId, sessionId, idempotencyKey: "menu-category-command" };
const headers = {
  "Content-Type": "application/json",
  "Idempotency-Key": identity.idempotencyKey,
  "x-expected-session-id": sessionId,
};

function page({ revision = 3, session = sessionId } = {}) {
  return {
    sessionId: session,
    revision,
    categories: [second],
    nextCursor: null,
  };
}

function firstPage() {
  return Response.json({ sessionId, revision: 3, categories: [category], nextCursor: cursor });
}

afterEach(() => vi.unstubAllGlobals());

test("[MER-09] reads all ordered category pages within one revision and session", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(firstPage())
    .mockResolvedValueOnce(Response.json(page()));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(listMenuCategories({ merchantId, signal })).resolves.toEqual({
    kind: "ready",
    data: { revision: 3, sessionId, categories: [category, second] },
  });
  expect(fetch).toHaveBeenNthCalledWith(1, `${endpoint}?limit=100`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${endpoint}?limit=100&${new URLSearchParams({ cursor }).toString()}`,
    expect.objectContaining({ method: "GET", signal }),
  );
});

test.each([
  [{ revision: 4 }, "revision-conflict"],
  [{ session: otherSession }, "session-changed"],
] as const)(
  "[MER-09] refuses partial category pages after a changed revision or session",
  async (override, kind) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(firstPage())
        .mockResolvedValueOnce(Response.json(page(override))),
    );

    await expect(
      listMenuCategories({ merchantId, signal: new AbortController().signal }),
    ).resolves.toEqual({ kind });
  },
);

test("[MER-09] a category create and rename bind the expected revision and authenticated session", async () => {
  const data = { category, revision: 4 };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(data, { status: 201 }))
    .mockResolvedValueOnce(Response.json(data));
  vi.stubGlobal("fetch", fetch);

  await expect(saveMenuCategory({ ...identity, input })).resolves.toEqual({ kind: "ok", data });
  await expect(
    saveMenuCategory({ ...identity, categoryId: category.categoryId, input }),
  ).resolves.toEqual({
    kind: "ok",
    data,
  });
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    endpoint,
    expect.objectContaining({
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }),
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${endpoint}/${category.categoryId}`,
    expect.objectContaining({
      method: "PUT",
      headers,
      body: JSON.stringify(input),
    }),
  );
});

test("[MER-09] reorder sends the complete category set as one revision-bound command", async () => {
  const order = { categoryIds: [second.categoryId, category.categoryId], expectedRevision: 3 };
  const data = { categoryIds: order.categoryIds, revision: 4 };
  const fetch = vi.fn().mockResolvedValue(Response.json(data));
  vi.stubGlobal("fetch", fetch);

  await expect(saveMenuCategoryOrder({ ...identity, input: order })).resolves.toEqual({
    kind: "ok",
    data,
  });
  expect(fetch).toHaveBeenCalledWith(
    `${endpoint}/order`,
    expect.objectContaining({
      method: "PUT",
      headers,
      body: JSON.stringify(order),
    }),
  );
});

test("[MER-09] recognizes only validated session and revision conflicts and preserves uncertain retry keys", async () => {
  const problem = { type: "about:blank", title: "Conflict", status: 409, requestId: "menu-test" };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...problem, code: "session_changed" }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...problem, code: "revision_conflict" }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json({ code: "session_changed" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ ...problem, code: "category_limit" }, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockRejectedValueOnce(new TypeError("Lost response")),
  );

  const command = { ...identity, input };
  await expect(saveMenuCategory(command)).resolves.toEqual({ kind: "session-changed" });
  await expect(saveMenuCategory(command)).resolves.toEqual({ kind: "revision-conflict" });
  await expect(saveMenuCategory(command)).resolves.toEqual({
    kind: "error",
    shouldReuseKey: false,
  });
  await expect(saveMenuCategory(command)).resolves.toEqual({
    kind: "category-limit",
    shouldReuseKey: false,
  });
  await expect(saveMenuCategory(command)).resolves.toEqual({
    kind: "rate-limited",
    shouldReuseKey: true,
  });
  await expect(saveMenuCategory(command)).resolves.toEqual({ kind: "error", shouldReuseKey: true });
});
