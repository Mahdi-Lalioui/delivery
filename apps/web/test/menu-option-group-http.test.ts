import { afterEach, expect, test, vi } from "vitest";
import {
  listOptionGroups,
  readOptionGroup,
  refreshOptionGroups,
  saveOptionGroup,
  type OptionGroup,
  type OptionGroupCommand,
} from "../src/menu-option-group/option-group-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const optionGroupId = "019d6abc-1234-7234-8234-123456789002";
const optionId = "019d6abc-1234-7234-8234-123456789003";
const otherId = "019d6abc-1234-7234-8234-123456789004";
const endpoint = `/v1/merchants/${merchantId}/menu/option-groups`;
const signal = new AbortController().signal;
const group = { optionGroupId, names: { fr: "Sauces" }, minimum: 0, maximum: 1 };
const option = { names: { ar: "ثوم" }, priceDeltaDzd: 5, isDefault: true, isAvailable: false };
const detail = { ...group, options: [{ ...option, optionId }] } satisfies OptionGroup;
const fields = {
  names: group.names,
  minimum: group.minimum,
  maximum: group.maximum,
  expectedRevision: 7,
};

afterEach(() => vi.unstubAllGlobals());

test("[MER-10] reads the whole library using revision-bound pagination", async () => {
  const other = { ...group, optionGroupId: otherId };
  const context = { restaurantName: "Restaurant fictif" };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        sessionId,
        revision: 7,
        optionGroups: [group],
        context,
        nextCursor: `7~${optionGroupId}`,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ sessionId, revision: 7, optionGroups: [other], nextCursor: null }),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(listOptionGroups({ merchantId, signal })).resolves.toEqual({
    kind: "ready",
    data: { sessionId, revision: 7, context, optionGroups: [group, other] },
  });
  expect(fetch).toHaveBeenNthCalledWith(1, endpoint + "?limit=100", {
    method: "GET",
    signal,
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${endpoint}?limit=100&cursor=7%7E${optionGroupId}`,
    expect.any(Object),
  );
});

test.each([
  [{ sessionId: otherId }, "session-changed"],
  [{ revision: 8 }, "revision-conflict"],
  [{ optionGroup: { ...detail, optionGroupId: otherId } }, "error"],
] as const)(
  "[MER-10] refuses detail from the wrong session, revision or group",
  async (override, kind) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ sessionId, revision: 7, optionGroup: detail, ...override }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      readOptionGroup({ merchantId, optionGroupId, sessionId, revision: 7, signal }),
    ).resolves.toEqual({ kind });
    expect(fetch).toHaveBeenCalledWith(
      `${endpoint}/${optionGroupId}`,
      expect.objectContaining({ method: "GET", signal }),
    );
  },
);

const commands = [
  { kind: "create", input: { ...fields, options: [option] } },
  { kind: "edit", optionGroupId, input: { ...fields, options: [{ ...option, optionId }] } },
] as const satisfies readonly OptionGroupCommand[];

test.each(commands)(
  "[MER-10] sends session, revision and stable identities for $kind",
  async (command) => {
    const data = { optionGroup: detail, revision: 8 };
    const fetch = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal("fetch", fetch);
    await expect(
      saveOptionGroup({ merchantId, sessionId, idempotencyKey: "group-first-key", command }),
    ).resolves.toEqual({ kind: "saved", data });
    expect(fetch).toHaveBeenCalledWith(
      command.kind === "create" ? endpoint : `${endpoint}/${optionGroupId}`,
      {
        method: command.kind === "create" ? "POST" : "PUT",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify(command.input),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "group-first-key",
          "x-expected-session-id": sessionId,
        },
      },
    );
  },
);

test("[MER-10] distinguishes session and revision changes and supports uncertain retries", async () => {
  const problem = {
    type: "about:blank",
    title: "Conflict",
    status: 409,
    requestId: "option-group-test",
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
  const params = { merchantId, sessionId, idempotencyKey: "group-first-key", command: commands[0] };
  await expect(saveOptionGroup(params)).resolves.toEqual({ kind: "session-changed" });
  await expect(saveOptionGroup(params)).resolves.toEqual({ kind: "revision-conflict" });
  await expect(saveOptionGroup(params)).resolves.toEqual({ kind: "error", shouldReuseKey: false });
  await expect(saveOptionGroup(params)).resolves.toEqual({
    kind: "rate-limited",
    shouldReuseKey: true,
  });
  await expect(saveOptionGroup(params)).resolves.toEqual({ kind: "error", shouldReuseKey: true });
});

test.each([
  [{ sessionId: otherId, revision: 8 }, "session-changed"],
  [{ sessionId, revision: 6 }, "revision-conflict"],
] as const)(
  "[MER-10] the saved group's readback checks the original session and new revision",
  async (override, kind) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ ...override, optionGroups: [group], nextCursor: null })),
    );
    await expect(
      refreshOptionGroups({ merchantId, signal, sessionId, minimumRevision: 8 }),
    ).resolves.toEqual({ kind });
  },
);

test("[MER-10] a session swap between pages never exposes a partial library", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          sessionId,
          revision: 7,
          optionGroups: [group],
          nextCursor: `7~${optionGroupId}`,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ sessionId: otherId, revision: 7, optionGroups: [], nextCursor: null }),
      ),
  );
  await expect(listOptionGroups({ merchantId, signal })).resolves.toEqual({
    kind: "session-changed",
  });
});
