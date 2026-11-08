import { expect, test } from "vitest";
import { initialMenuImportState, reduceMenuImport } from "../src/menu-import/import-flow";
import type { MenuImportDraft, MenuImportState } from "../src/menu-import/import-flow";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const otherSession = "019d6abc-1234-7234-8234-123456789002";
const draft = {
  fileId: "file-1",
  merchantId,
  sessionId,
  input: {
    rows: [
      {
        external_key: "grill-01",
        category_fr: "Plats",
        name_fr: "Grillade",
        description_fr: "Plat grillé",
        price_dzd: "750",
      },
    ],
    expectedRevision: 8,
  },
} satisfies MenuImportDraft;
const summary = { categoriesCreated: 1, itemsCreated: 1, itemsUpdated: 0, itemsUnchanged: 0 };
const preview = {
  sessionId,
  revision: 8,
  summary,
  errors: [],
  previewToken: "a".repeat(43),
};
const result = { revision: 9, summary };
const review = reduceMenuImport(initialMenuImportState, { kind: "file-loaded", draft });
const previewing = reduceMenuImport(review, { kind: "preview-started", requestId: "preview-1" });
const previewed = reduceMenuImport(previewing, {
  kind: "preview-finished",
  requestId: "preview-1",
  result: { kind: "ready", data: preview },
});

function applying(state: MenuImportState = previewed, idempotencyKey = "apply-1") {
  return reduceMenuImport(state, { kind: "apply-started", idempotencyKey });
}

test("[MER-12:flow] requires review, preview and a separate explicit apply action", () => {
  expect(initialMenuImportState).toEqual({ kind: "editing" });
  expect(review).toEqual({ kind: "review", draft });
  expect(applying(review)).toBe(review);
  expect(previewing).toEqual({ kind: "previewing", draft, requestId: "preview-1" });
  expect(previewed).toEqual({ kind: "previewed", draft, preview });
  expect(applying()).toEqual({ kind: "applying", draft, preview, idempotencyKey: "apply-1" });
});

test("[MER-12:flow] a validation report can be reviewed without enabling apply", () => {
  const report = {
    ...preview,
    previewToken: null,
    errors: [{ row: 2, field: "price_dzd", reason: "invalid_price" }],
  } as const;
  const invalid = reduceMenuImport(previewing, {
    kind: "preview-finished",
    requestId: "preview-1",
    result: { kind: "ready", data: { ...report, errors: [...report.errors] } },
  });
  expect(invalid).toMatchObject({
    kind: "previewed",
    preview: { previewToken: null, errors: report.errors },
  });
  expect(applying(invalid)).toBe(invalid);
});

test("[MER-12:flow] snapshots the reviewed rows before preview so later caller edits cannot alter apply", () => {
  const mutable = structuredClone(draft);
  const loaded = reduceMenuImport(initialMenuImportState, { kind: "file-loaded", draft: mutable });
  const first = mutable.input.rows[0];
  if (!first) throw new Error("Expected an imported row");
  first.price_dzd = "999";
  expect(loaded).toMatchObject({ draft });
});

test("[MER-12:flow] discards tokens and retry keys when file or rows change", () => {
  const retryable = reduceMenuImport(applying(), {
    kind: "apply-finished",
    idempotencyKey: "apply-1",
    result: { kind: "error", shouldReuseKey: true },
  });
  const replacement = { ...draft, fileId: "file-2" };
  expect(reduceMenuImport(retryable, { kind: "file-loaded", draft: replacement })).toEqual({
    kind: "review",
    draft: replacement,
  });
  const input = { ...draft.input, rows: [{ ...draft.input.rows[0], price_dzd: "800" }] };
  expect(reduceMenuImport(retryable, { kind: "rows-changed", input })).toEqual({
    kind: "review",
    draft: { ...draft, input },
  });
});

test("[MER-12:flow] menu revision changes require a new preview and session changes discard private rows", () => {
  const same = { merchantId, sessionId, revision: 8 };
  expect(reduceMenuImport(previewed, { kind: "context-changed", ...same })).toBe(previewed);
  expect(reduceMenuImport(previewed, { kind: "context-changed", ...same, revision: 9 })).toEqual({
    kind: "review",
    draft: { ...draft, input: { ...draft.input, expectedRevision: 9 } },
  });
  expect(
    reduceMenuImport(applying(), { kind: "context-changed", ...same, sessionId: otherSession }),
  ).toEqual({ kind: "editing", failure: "session-changed" });
});

test("[MER-12:flow] ignores late preview and apply responses after a replacement or reset", () => {
  const replacement = reduceMenuImport(previewing, {
    kind: "file-loaded",
    draft: { ...draft, fileId: "file-2" },
  });
  const newer = reduceMenuImport(replacement, { kind: "preview-started", requestId: "preview-2" });
  expect(
    reduceMenuImport(newer, {
      kind: "preview-finished",
      requestId: "preview-1",
      result: { kind: "ready", data: preview },
    }),
  ).toBe(newer);
  const reset = reduceMenuImport(applying(), { kind: "reset" });
  expect(
    reduceMenuImport(reset, {
      kind: "apply-finished",
      idempotencyKey: "apply-1",
      result: { kind: "saved", data: result },
    }),
  ).toBe(reset);
});

test("[MER-12:flow] uncertainty then throttling preserves one key and returns the exact replay receipt", () => {
  const failed = reduceMenuImport(applying(), {
    kind: "apply-finished",
    idempotencyKey: "apply-1",
    result: { kind: "error", shouldReuseKey: true },
  });
  expect(failed).toEqual({
    kind: "previewed",
    draft,
    preview,
    retryKey: "apply-1",
    failure: "error",
  });
  const retry = applying(failed, "accidental-new-key");
  expect(retry).toMatchObject({ kind: "applying", idempotencyKey: "apply-1" });
  const throttled = reduceMenuImport(retry, {
    kind: "apply-finished",
    idempotencyKey: "apply-1",
    result: { kind: "rate-limited", shouldReuseKey: true },
  });
  expect(throttled).toMatchObject({
    kind: "previewed",
    retryKey: "apply-1",
    failure: "rate-limited",
  });
  const completed = reduceMenuImport(applying(throttled), {
    kind: "apply-finished",
    idempotencyKey: "apply-1",
    result: { kind: "saved", data: result },
  });
  expect(completed).toEqual({ kind: "applied", result });
  expect(applying(completed)).toBe(completed);
});

test("[MER-12:flow] a terminal generic failure drops the key and a stale token requires another preview", () => {
  const generic = reduceMenuImport(applying(), {
    kind: "apply-finished",
    idempotencyKey: "apply-1",
    result: { kind: "error", shouldReuseKey: false },
  });
  expect(generic).toEqual({ kind: "previewed", draft, preview, failure: "error" });
  expect(applying(generic, "fresh")).toMatchObject({ idempotencyKey: "fresh" });
  expect(
    reduceMenuImport(applying(), {
      kind: "apply-finished",
      idempotencyKey: "apply-1",
      result: { kind: "invalid-preview" },
    }),
  ).toEqual({ kind: "review", draft, failure: "invalid-preview" });
});

test.each(["session-changed", "sign-in", "forbidden"] as const)(
  "[MER-12:flow] %s clears all private imported rows",
  (kind) => {
    expect(
      reduceMenuImport(applying(), {
        kind: "apply-finished",
        idempotencyKey: "apply-1",
        result: { kind },
      }),
    ).toEqual({ kind: "editing", failure: kind });
  },
);

test("[MER-12:flow] refuses a preview from a changed session or revision", () => {
  expect(
    reduceMenuImport(previewing, {
      kind: "preview-finished",
      requestId: "preview-1",
      result: { kind: "ready", data: { ...preview, sessionId: otherSession } },
    }),
  ).toEqual({ kind: "editing", failure: "session-changed" });
  expect(
    reduceMenuImport(previewing, {
      kind: "preview-finished",
      requestId: "preview-1",
      result: { kind: "ready", data: { ...preview, revision: 9 } },
    }),
  ).toEqual({ kind: "review", draft, failure: "revision-conflict" });
});
