import { createHmac, timingSafeEqual } from "node:crypto";

interface ImportPreview {
  readonly accountId: string;
  readonly merchantId: string;
  readonly sessionId: string;
  readonly revision: number;
  readonly rows: readonly object[];
}

export function createImportPreviewToken(
  key: Uint8Array,
  { accountId, merchantId, sessionId, revision, rows }: ImportPreview,
): string {
  return createHmac("sha256", key)
    .update("menu-import-preview-v1\0")
    .update(JSON.stringify([accountId, merchantId, sessionId, revision, rows]))
    .digest("base64url");
}

export function matchesImportPreviewToken(
  key: Uint8Array,
  preview: ImportPreview,
  token: string,
): boolean {
  const candidate = Buffer.from(token);
  const expected = Buffer.from(createImportPreviewToken(key, preview));
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
