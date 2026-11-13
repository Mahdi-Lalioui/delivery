import { afterEach, expect, test, vi } from "vitest";
import {
  applyMenuImport,
  previewMenuImport,
  type MenuImportInput,
} from "../src/menu-import/import-http";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const otherSession = "019d6abc-1234-7234-8234-123456789002";
const path = `/v1/merchants/${merchantId}/menu/import`;
const signal = new AbortController().signal;
const input = {
  rows: [
    {
      external_key: "grill-01",
      category_fr: "Plats",
      name_ar: "مشاوي",
      description_fr: "Plat grillé",
      price_dzd: "750",
    },
  ],
  expectedRevision: 8,
} satisfies MenuImportInput;
const summary = { categoriesCreated: 1, itemsCreated: 1, itemsUpdated: 0, itemsUnchanged: 0 };
const token = "a".repeat(43);
const preview = { sessionId, revision: 8, summary, previewToken: token, errors: [] };
const applyInput = { ...input, previewToken: token };
const command = { merchantId, sessionId, input: applyInput, idempotencyKey: "menu-import-first" };

afterEach(() => vi.unstubAllGlobals());

test("[MER-12:client] previews raw rows privately against the current session and revision", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(preview));
  vi.stubGlobal("fetch", fetch);
  await expect(previewMenuImport({ merchantId, sessionId, input, signal })).resolves.toEqual({
    kind: "ready",
    data: preview,
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(path + "/preview", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  expect(fetch.mock.calls[0]?.[0]).not.toContain("grill-01");
});

test("[MER-12:client] preserves a row-field validation report with no apply token", async () => {
  const report = {
    ...preview,
    previewToken: null,
    errors: [{ row: 2, field: "price_dzd", reason: "invalid_price" }],
    summary: { categoriesCreated: 0, itemsCreated: 0, itemsUpdated: 0, itemsUnchanged: 0 },
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(report)));
  await expect(previewMenuImport({ merchantId, sessionId, input, signal })).resolves.toEqual({
    kind: "ready",
    data: report,
  });
});

test.each([
  [{ sessionId: otherSession }, "session-changed"],
  [{ revision: 9 }, "revision-conflict"],
  [
    { errors: [{ row: 501, field: "price_dzd", reason: "invalid_price" }], previewToken: null },
    "error",
  ],
  [{ extra: "private diagnostics" }, "error"],
] as const)(
  "[MER-12:client] rejects a preview bound to another context or malformed report",
  async (changes, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...preview, ...changes })));
    await expect(previewMenuImport({ merchantId, sessionId, input, signal })).resolves.toEqual({
      kind,
    });
  },
);

test("[MER-12:client] replays the exact apply receipt using the same body and idempotency key", async () => {
  const receipt = { revision: 9, summary };
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Lost committed response"))
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(Response.json(receipt, { status: 201 }));
  vi.stubGlobal("fetch", fetch);

  await expect(applyMenuImport(command)).resolves.toEqual({ kind: "error", shouldReuseKey: true });
  await expect(applyMenuImport(command)).resolves.toEqual({
    kind: "rate-limited",
    shouldReuseKey: true,
  });
  await expect(applyMenuImport(command)).resolves.toEqual({ kind: "saved", data: receipt });
  for (const call of fetch.mock.calls) {
    expect(call).toEqual([
      path + "/apply",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": command.idempotencyKey,
          "x-expected-session-id": sessionId,
        },
        body: JSON.stringify(applyInput),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
      },
    ]);
  }
});

const conflictCases = [
  ["session_changed", "session-changed"],
  ["revision_conflict", "revision-conflict"],
  ["invalid_preview_token", "invalid-preview"],
  ["import_conflict", "import-conflict"],
  ["idempotency_conflict", "idempotency-conflict"],
] as const;

test.each(conflictCases)(
  "[MER-12:client] exposes the typed %s conflict without server detail",
  async (code, kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            type: "about:blank",
            title: "Private internal title",
            status: 409,
            code,
            requestId: "test-import",
            detail: "Private import contents",
          },
          { status: 409 },
        ),
      ),
    );
    await expect(applyMenuImport(command)).resolves.toEqual({ kind });
  },
);

test.each([
  { status: 401, kind: "sign-in" },
  { status: 403, kind: "forbidden" },
  { status: 404, kind: "forbidden" },
  { status: 413, kind: "too-large" },
])(
  "[MER-12:client] maps HTTP $status without retaining the response text",
  async ({ status, kind }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Private body", { status })));
    await expect(applyMenuImport(command)).resolves.toEqual({ kind });
  },
);

test("[MER-12:client] requires a validated matching problem status before interpreting server codes", async () => {
  const problem = {
    type: "about:blank",
    title: "Private title",
    status: 400,
    code: "invalid_import_rows",
    requestId: "test-import",
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(problem, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ ...problem, status: 409 }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ code: "session_changed" }, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ revision: 9 }, { status: 201 })),
  );
  await expect(applyMenuImport(command)).resolves.toEqual({ kind: "invalid-rows" });
  await expect(applyMenuImport(command)).resolves.toEqual({ kind: "error", shouldReuseKey: false });
  await expect(applyMenuImport(command)).resolves.toEqual({ kind: "error", shouldReuseKey: false });
  await expect(applyMenuImport(command)).resolves.toEqual({ kind: "error", shouldReuseKey: true });
  await expect(applyMenuImport(command)).resolves.toEqual({ kind: "error", shouldReuseKey: true });
});
