import { createHash } from "node:crypto";
import { menuImportApplyOutput, menuImportPreviewOutput } from "@zaafran/contracts/menu-import";
import type { createMenuImportRepository } from "@zaafran/db/menu-import";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import { createImportPreviewToken } from "../src/menu-import-preview.js";
import { validateMenuImportRows } from "../src/menu-import-rows.js";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMenuImportRepository>;
const now = new Date("2026-11-08T12:00:00Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const otherSessionId = "01932f18-3150-7c33-8a7a-53acfd343004";
const owner = { role: "merchant_owner", accountId, sessionId } as const;
const previewKey = Buffer.alloc(32, 19);
const path = "/v1/merchants/" + merchantId + "/menu/import";
const row = {
  external_key: "plate-001",
  category_fr: "Plats fictifs",
  name_fr: "Plat fictif",
  description_fr: "Description fictive",
  price_dzd: "٤٥٠",
};
const payload = { rows: [row], expectedRevision: 4 };
const rows = validateMenuImportRows(payload.rows).rows;
const summary = { categoriesCreated: 1, itemsCreated: 1, itemsUpdated: 0, itemsUnchanged: 0 };
const emptySummary = { categoriesCreated: 0, itemsCreated: 0, itemsUpdated: 0, itemsUnchanged: 0 };
const headers = { "idempotency-key": "fixture-import", "x-expected-session-id": sessionId };
const previewToken = createImportPreviewToken(previewKey, {
  accountId,
  merchantId,
  sessionId,
  revision: 4,
  rows,
});

function setup(actor: Actor | undefined) {
  const repository = {
    preview: vi.fn<Repository["preview"]>(),
    apply: vi.fn<Repository["apply"]>(),
  } satisfies Repository;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    menuImport: { repository, now: () => now, previewKey },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-12:http] previews canonical rows and binds a token to the current session", async () => {
  const { api, repository } = setup(owner);
  repository.preview.mockResolvedValue({ kind: "previewed", revision: 4, summary, errors: [] });
  const response = await api.inject({ method: "POST", url: path + "/preview", payload });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(menuImportPreviewOutput.parse(response.json())).toEqual({
    sessionId,
    revision: 4,
    summary,
    errors: [],
    previewToken,
  });
  expect(repository.preview).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    expectedRevision: 4,
    rows,
  });
});

test("[MER-12:http] authenticates invalid rows and returns only their field report", async () => {
  const { api, repository } = setup(owner);
  repository.preview.mockResolvedValue({ kind: "previewed", revision: 4, summary, errors: [] });
  const response = await api.inject({
    method: "POST",
    url: path + "/preview",
    payload: { ...payload, rows: [{ ...row, price_dzd: "bad" }] },
  });
  expect(response.statusCode).toBe(200);
  expect(menuImportPreviewOutput.parse(response.json())).toEqual({
    sessionId,
    revision: 4,
    summary: emptySummary,
    previewToken: null,
    errors: [{ row: 2, field: "price_dzd", reason: "invalid_price" }],
  });
  expect(repository.preview).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    expectedRevision: 4,
    rows: [],
  });
  repository.preview.mockResolvedValue({ kind: "not_found" });
  const foreign = await api.inject({
    method: "POST",
    url: path + "/preview",
    payload: { ...payload, rows: [{}] },
  });
  expect(foreign.statusCode).toBe(404);
  expect(foreign.body).not.toContain("required");
});

test("[MER-12:http] withholds the token and counts for database validation errors", async () => {
  const { api, repository } = setup(owner);
  const errors = [{ row: 2, field: "external_key", reason: "archived_key" }] as const;
  repository.preview.mockResolvedValue({
    kind: "previewed",
    revision: 4,
    summary,
    errors: [...errors],
  });
  const response = await api.inject({ method: "POST", url: path + "/preview", payload });
  expect(response.statusCode).toBe(200);
  expect(menuImportPreviewOutput.parse(response.json())).toMatchObject({
    previewToken: null,
    summary: emptySummary,
    errors,
  });
});

test("[MER-12:http] applies a valid bound preview and fingerprints its session", async () => {
  const { api, repository } = setup(owner);
  repository.apply.mockResolvedValue({ kind: "applied", revision: 5, summary });
  const response = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: { ...payload, previewToken },
  });
  expect(response.statusCode).toBe(201);
  expect(menuImportApplyOutput.parse(response.json())).toEqual({ revision: 5, summary });
  expect(response.headers["cache-control"]).toBe("no-store");
  const input = { expectedRevision: 4, rows };
  expect(repository.apply).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    input,
    now,
    idempotencyKeyHash: createHash("sha256").update(headers["idempotency-key"]).digest(),
    requestHash: createHash("sha256")
      .update(JSON.stringify({ sessionId, ...input }))
      .digest(),
  });
});

test.each([
  { ...payload, previewToken: "A".repeat(43) },
  { ...payload, expectedRevision: 3, previewToken },
  { ...payload, rows: [{ ...row, price_dzd: "451" }], previewToken },
])("[MER-12:http] rejects a changed preview before calling the command receipt", async (body) => {
  const { api, repository } = setup(owner);
  const response = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: body,
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({ code: "invalid_preview_token" });
  expect(repository.apply).not.toHaveBeenCalled();
});

test("[MER-12:http] accepts equivalent canonical cells and replays exact results", async () => {
  const { api, repository } = setup(owner);
  repository.apply.mockResolvedValue({ kind: "replayed", revision: 5, summary });
  const response = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: {
      ...payload,
      rows: [{ ...row, name_fr: "  Plat fictif ", price_dzd: "450" }],
      previewToken,
    },
  });
  expect(response.statusCode).toBe(201);
  expect(menuImportApplyOutput.parse(response.json())).toEqual({ revision: 5, summary });
});

test("[MER-12:http] requires matching session headers and rejects another session's token", async () => {
  const { api, repository } = setup({ ...owner, sessionId: otherSessionId });
  const changed = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: { ...payload, previewToken },
  });
  expect(changed.statusCode).toBe(409);
  expect(changed.json()).toMatchObject({ code: "session_changed" });
  const other = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers: { ...headers, "x-expected-session-id": otherSessionId },
    payload: { ...payload, previewToken },
  });
  expect(other.statusCode).toBe(409);
  expect(other.json()).toMatchObject({ code: "invalid_preview_token" });
  expect(repository.apply).not.toHaveBeenCalled();
});

test("[MER-12:http] reports invalid rows, required headers and schema errors without applying", async () => {
  const { api, repository } = setup(owner);
  const invalid = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: { ...payload, rows: [{}], previewToken },
  });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.json()).toMatchObject({ code: "invalid_import_rows" });
  for (const body of [
    { ...payload, previewToken: "bad" },
    { rows: [], expectedRevision: 4 },
    payload,
  ]) {
    const response = await api.inject({ method: "POST", url: path + "/apply", payload: body });
    expect(response.statusCode).toBe(400);
  }
  expect(repository.apply).not.toHaveBeenCalled();
});

test("[MER-12:http] maps stale and idempotency conflicts to problem responses", async () => {
  const { api, repository } = setup(owner);
  repository.preview.mockResolvedValue({ kind: "revision_conflict" });
  expect((await api.inject({ method: "POST", url: path + "/preview", payload })).statusCode).toBe(
    409,
  );
  for (const kind of ["not_found", "revision_conflict", "idempotency_conflict"] as const) {
    repository.apply.mockResolvedValue({ kind });
    const response = await api.inject({
      method: "POST",
      url: path + "/apply",
      headers,
      payload: { ...payload, previewToken },
    });
    expect(response.statusCode).toBe(kind === "not_found" ? 404 : 409);
    expect(response.json()).toMatchObject({ code: kind });
  }
  repository.apply.mockResolvedValue({
    kind: "import_conflict",
    errors: [{ row: 2, field: "category_ar", reason: "ambiguous_category" }],
  });
  const conflict = await api.inject({
    method: "POST",
    url: path + "/apply",
    headers,
    payload: { ...payload, previewToken },
  });
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json()).toMatchObject({ code: "import_conflict" });
  expect(conflict.body).not.toContain(row.name_fr);
});

test.each([
  undefined,
  { ...owner, role: "merchant_staff" },
  { ...owner, role: "courier" },
  { ...owner, role: "admin" },
] as const)(
  "[MER-12:http] denies an unauthorized actor for both import operations",
  async (actor) => {
    const { api, repository } = setup(actor);
    for (const suffix of ["preview", "apply"]) {
      const response = await api.inject({
        method: "POST",
        url: path + "/" + suffix,
        headers,
        payload: suffix === "preview" ? payload : { ...payload, previewToken },
      });
      expect(response.statusCode).toBe(actor === undefined ? 401 : 403);
    }
    expect(repository.preview).not.toHaveBeenCalled();
    expect(repository.apply).not.toHaveBeenCalled();
  },
);

test("[MER-12:http] preserves the 256 KiB request body limit", async () => {
  const { api, repository } = setup(owner);
  const response = await api.inject({
    method: "POST",
    url: path + "/preview",
    payload: {
      rows: Array.from({ length: 300 }, () => ({ ...row, description_fr: "x".repeat(1000) })),
      expectedRevision: 4,
    },
  });
  expect(response.statusCode).toBe(413);
  expect(response.json()).toMatchObject({ code: "payload_too_large" });
  expect(repository.preview).not.toHaveBeenCalled();
});
