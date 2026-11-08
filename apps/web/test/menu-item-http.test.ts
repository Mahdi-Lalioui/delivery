import { afterEach, expect, test, vi } from "vitest";
import {
  listMenuItems,
  refreshMenuItems,
  writeMenuItem,
  type MenuItemCommand,
} from "../src/menu-item/menu-item-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const categoryId = "019d6abc-1234-7234-8234-123456789002";
const itemId = "019d6abc-1234-7234-8234-123456789003";
const secondItemId = "019d6abc-1234-7234-8234-123456789004";
const revision = 8;
const cursor = `${String(revision)}~${itemId}`;
const endpoint = `/v1/merchants/${merchantId}/menu/items`;
const itemInput = {
  categoryId,
  names: { fr: "Grillade" },
  descriptions: { ar: "وجبة مشوية" },
  priceDzd: 1200,
  extraPrepMinutes: 15,
  tags: [],
  optionGroupIds: [],
  photoId: null,
};
const input = { ...itemInput, expectedRevision: revision };
const item = {
  ...itemInput,
  itemId,
  isAvailable: true,
  soldOutUntil: null,
  moderationStatus: "unreviewed",
};
const second = { ...item, itemId: secondItemId };
const request = { merchantId, categoryId, signal: new AbortController().signal };
const identity = { merchantId, sessionId, idempotencyKey: "menu-item-first" };

function page(items: unknown[], nextCursor: string | null, override: object = {}) {
  return Response.json({ sessionId, revision, items, nextCursor, ...override });
}

afterEach(() => vi.unstubAllGlobals());

test("[MER-09:items] loads the selected category's entire revision-bound item list", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(page([item], cursor))
    .mockResolvedValueOnce(page([second], null));
  vi.stubGlobal("fetch", fetch);

  await expect(listMenuItems(request)).resolves.toEqual({
    kind: "ready",
    data: { sessionId, revision, items: [item, second] },
  });
  expect(fetch).toHaveBeenNthCalledWith(1, `${endpoint}?categoryId=${categoryId}&limit=100`, {
    method: "GET",
    signal: request.signal,
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
  });
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${endpoint}?categoryId=${categoryId}&limit=100&cursor=${String(revision)}%7E${itemId}`,
    expect.objectContaining({ method: "GET", signal: request.signal }),
  );
});

test.each([
  [{ revision: 9 }, "revision-conflict"],
  [{ sessionId: "019d6abc-1234-7234-8234-123456789099" }, "session-changed"],
  [{ items: [{ ...second, categoryId: "019d6abc-1234-7234-8234-123456789099" }] }, "error"],
] as const)(
  "[MER-09:items] refuses incomplete or mismatched category pages",
  async (override, kind) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(page([item], cursor))
        .mockResolvedValueOnce(page([second], null, override)),
    );
    await expect(listMenuItems(request)).resolves.toEqual({ kind });
  },
);

const archiveData = { itemId, archivedAt: "2026-11-07T18:12:00.000Z", revision: 9 };
const availabilityData = {
  itemId,
  isAvailable: false,
  soldOutUntil: "2026-11-07T23:00:00.000Z",
  revision: 9,
};

test.each(
  (
    [
      [{ kind: "create", input }, "POST", "", { item, revision: 9 }, "saved"],
      [{ kind: "edit", itemId, input }, "PUT", `/${itemId}`, { item, revision: 9 }, "saved"],
      [
        { kind: "duplicate", itemId, input: { expectedRevision: revision } },
        "POST",
        `/${itemId}/duplicate`,
        { item: second, revision: 9 },
        "saved",
      ],
      [
        { kind: "archive", itemId, input: { expectedRevision: revision } },
        "POST",
        `/${itemId}/archive`,
        archiveData,
        "archived",
      ],
      [
        {
          kind: "availability",
          itemId,
          input: { expectedRevision: revision, availability: "end_of_day" },
        },
        "PUT",
        `/${itemId}/availability`,
        availabilityData,
        "availability",
      ],
    ] as const satisfies readonly (readonly [MenuItemCommand, string, string, object, string])[]
  ).map(([command, method, suffix, data, kind]) => ({ command, method, suffix, data, kind })),
)(
  "[MER-09:items] sends session and revision for each item write",
  async ({ command, method, suffix, data, kind }) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal("fetch", fetch);

    await expect(writeMenuItem({ ...identity, command })).resolves.toEqual({ kind, data });
    expect(fetch).toHaveBeenCalledWith(
      endpoint + suffix,
      expect.objectContaining({
        method,
        body: JSON.stringify(command.input),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": identity.idempotencyKey,
          "x-expected-session-id": sessionId,
        },
      }),
    );
  },
);

test("[MER-09:items] only validated session conflicts clear the item view and 429 can reuse the key", async () => {
  const problem = {
    type: "about:blank",
    title: "Conflict",
    status: 409,
    requestId: "menu-item-test",
  };
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
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockRejectedValueOnce(new TypeError("Lost response")),
  );
  const command = { ...identity, command: { kind: "create", input } as const };

  await expect(writeMenuItem(command)).resolves.toEqual({ kind: "session-changed" });
  await expect(writeMenuItem(command)).resolves.toEqual({ kind: "revision-conflict" });
  await expect(writeMenuItem(command)).resolves.toEqual({ kind: "error", shouldReuseKey: false });
  await expect(writeMenuItem(command)).resolves.toEqual({
    kind: "rate-limited",
    shouldReuseKey: true,
  });
  await expect(writeMenuItem(command)).resolves.toEqual({ kind: "error", shouldReuseKey: true });
});

test.each([
  [{ sessionId: "019d6abc-1234-7234-8234-123456789099", revision: 9 }, "session-changed"],
  [{ revision: 8 }, "revision-conflict"],
] as const)(
  "[MER-09:items] post-write refresh refuses another session or a pre-write revision",
  async (override, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page([item], null, override)));
    await expect(refreshMenuItems({ ...request, sessionId, minimumRevision: 9 })).resolves.toEqual({
      kind,
    });
  },
);

test("[MER-09:items] does not show partial lists when pagination repeats a cursor", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(page([item], cursor))
      .mockResolvedValueOnce(page([second], cursor)),
  );
  await expect(listMenuItems(request)).resolves.toEqual({ kind: "error" });
});

test("[M2-10:moderation] reports a held text edit as a non-retryable conflict", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          code: "moderation_pending",
          requestId: sessionId,
        },
        { status: 409 },
      ),
    ),
  );
  await expect(
    writeMenuItem({ ...identity, command: { kind: "edit", itemId, input } }),
  ).resolves.toEqual({ kind: "moderation-pending", shouldReuseKey: false });
});
