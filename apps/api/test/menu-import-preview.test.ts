import { expect, test } from "vitest";
import { createImportPreviewToken, matchesImportPreviewToken } from "../src/menu-import-preview.ts";

const key = Buffer.alloc(32, 24);
const preview = {
  accountId: "account-a",
  merchantId: "restaurant-a",
  sessionId: "session-a",
  revision: 6,
  rows: [{ externalKey: "dish-1", priceDzd: 500 }],
};

test("[MER-12:preview] requires the exact previewed merchant, session, revision and rows", () => {
  const token = createImportPreviewToken(key, preview);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(matchesImportPreviewToken(key, preview, token)).toBe(true);
  for (const changed of [
    { accountId: "account-b" },
    { merchantId: "restaurant-b" },
    { sessionId: "session-b" },
    { revision: 7 },
    { rows: [{ externalKey: "dish-1", priceDzd: 501 }] },
  ]) {
    expect(matchesImportPreviewToken(key, { ...preview, ...changed }, token)).toBe(false);
  }
  expect(matchesImportPreviewToken(Buffer.alloc(32, 25), preview, token)).toBe(false);
  expect(matchesImportPreviewToken(key, preview, "invalid")).toBe(false);
});
