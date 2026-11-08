import { randomUUIDv7 } from "node:crypto";
import { menuImportApplyOutput, menuImportPreviewOutput } from "@zaafran/contracts/menu-import";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const { database, openApi, seedActor, seedMenuMerchants } =
  registerMerchantApiFixture("2026-11-08T12:00:00Z");
const row = {
  external_key: "meal-001",
  category_ar: "أطباق تجريبية",
  category_fr: "Plats fictifs",
  name_ar: "طبق تجريبي",
  name_fr: "Plat fictif",
  description_fr: "Description fictive",
  price_dzd: "٤٥٠",
};

function client(
  api: Awaited<ReturnType<typeof openApi>>,
  actor: Awaited<ReturnType<typeof seedActor>>,
  merchantId: string,
) {
  const root = `/v1/merchants/${merchantId}/menu/import`;
  return {
    preview(rows: object[], expectedRevision = 0) {
      return api.inject({
        method: "POST",
        url: root + "/preview",
        headers: actor.headers,
        payload: { rows, expectedRevision },
      });
    },
    apply({
      rows,
      expectedRevision,
      previewToken,
      key = randomUUIDv7(),
    }: {
      rows: object[];
      expectedRevision: number;
      previewToken: string;
      key?: string;
    }) {
      return api.inject({
        method: "POST",
        url: root + "/apply",
        headers: {
          ...actor.headers,
          "idempotency-key": key,
          "x-expected-session-id": actor.sessionId,
        },
        payload: { rows, expectedRevision, previewToken },
      });
    },
  };
}

test("[MER-12:http] imports atomically through production wiring and replays its receipt", async () => {
  const api = await openApi();
  const actor = await seedActor("+213500000171", "standard");
  const { owned } = await seedMenuMerchants(actor.userId, "1691");
  const menu = client(api, actor, owned);
  const preview = await menu.preview([row]);
  expect(preview.statusCode).toBe(200);
  const valid = menuImportPreviewOutput.parse(preview.json());
  expect(valid).toMatchObject({
    sessionId: actor.sessionId,
    revision: 0,
    errors: [],
    summary: { categoriesCreated: 1, itemsCreated: 1, itemsUpdated: 0, itemsUnchanged: 0 },
  });
  if (!valid.previewToken) throw new Error("Expected an authorized preview token.");
  const command = {
    rows: [row],
    expectedRevision: 0,
    previewToken: valid.previewToken,
    key: "first-import",
  };
  const applied = await menu.apply(command);
  expect(applied.statusCode).toBe(201);
  expect(menuImportApplyOutput.parse(applied.json())).toEqual({
    revision: 1,
    summary: valid.summary,
  });
  const replayed = await menu.apply(command);
  expect(replayed.statusCode).toBe(201);
  expect(replayed.body).toBe(applied.body);
  const same = await menu.preview([row], 1);
  expect(menuImportPreviewOutput.parse(same.json()).summary).toEqual({
    categoriesCreated: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsUnchanged: 1,
  });
  const { sql } = database.get();
  const [stored] = await sql`
    SELECT price_dzd, moderation_status, names FROM items WHERE merchant_id = ${owned}
  `;
  expect(stored).toMatchObject({
    price_dzd: 450,
    moderation_status: "unreviewed",
    names: { ar: row.name_ar, fr: row.name_fr },
  });
});

test("[MER-12:http] denies cross-tenant invalid previews and rejects changed token contexts", async () => {
  const api = await openApi();
  const actor = await seedActor("+213500000172", "standard");
  const { owned, staffed } = await seedMenuMerchants(actor.userId, "1692");
  const menu = client(api, actor, owned);
  const forbidden = await client(api, actor, staffed).preview([{}]);
  expect(forbidden.statusCode).toBe(404);
  const invalid = await menu.preview([{ ...row, price_dzd: "wrong" }]);
  expect(invalid.statusCode).toBe(200);
  expect(menuImportPreviewOutput.parse(invalid.json())).toMatchObject({
    previewToken: null,
    errors: [{ row: 2, field: "price_dzd", reason: "invalid_price" }],
    summary: { categoriesCreated: 0, itemsCreated: 0, itemsUpdated: 0, itemsUnchanged: 0 },
  });
  const valid = menuImportPreviewOutput.parse((await menu.preview([row])).json());
  if (!valid.previewToken) throw new Error("Expected a valid preview.");
  const changed = await menu.apply({
    rows: [{ ...row, price_dzd: "451" }],
    expectedRevision: 0,
    previewToken: valid.previewToken,
  });
  expect(changed.statusCode).toBe(409);
  expect(changed.json()).toMatchObject({ code: "invalid_preview_token" });
  const foreign = await client(api, actor, staffed).apply({
    rows: [row],
    expectedRevision: 0,
    previewToken: valid.previewToken,
  });
  expect(foreign.statusCode).toBe(409);
  expect(foreign.json()).toMatchObject({ code: "invalid_preview_token" });
  const { sql } = database.get();
  const [count] = await sql`SELECT count(*)::int AS value FROM items WHERE merchant_id = ${owned}`;
  expect(count?.value).toBe(0);
});

test("[MER-12:http] holds prohibited imports and reports archived external keys without a token", async () => {
  const api = await openApi();
  const actor = await seedActor("+213500000173", "standard");
  const { owned } = await seedMenuMerchants(actor.userId, "1693");
  const menu = client(api, actor, owned);
  const prohibited = { ...row, name_ar: "بيرة", name_fr: "Bière pression" };
  const valid = menuImportPreviewOutput.parse((await menu.preview([prohibited])).json());
  if (!valid.previewToken) throw new Error("Expected a valid preview.");
  const applied = await menu.apply({
    rows: [prohibited],
    expectedRevision: 0,
    previewToken: valid.previewToken,
  });
  expect(applied.statusCode).toBe(201);
  const { sql } = database.get();
  const [stored] = await sql`
    SELECT id, moderation_status FROM items WHERE merchant_id = ${owned}
  `;
  expect(stored?.moderation_status).toBe("blocked_pending_review");
  await sql`UPDATE items SET archived_at = '2026-11-08T12:00:01Z' WHERE merchant_id = ${owned}`;
  const archived = await menu.preview([prohibited], 1);
  expect(archived.statusCode).toBe(200);
  expect(menuImportPreviewOutput.parse(archived.json())).toMatchObject({
    previewToken: null,
    errors: [{ row: 2, field: "external_key", reason: "archived_key" }],
  });
});
