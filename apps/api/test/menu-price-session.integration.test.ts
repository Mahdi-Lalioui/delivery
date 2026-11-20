import { randomUUID } from "node:crypto";
import { bulkPriceApplyOutput } from "@zaafran/contracts/menu-price";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-19T12:00:00.000Z";
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[MER-11:security] bulk price routes reject mixed tenants and foreign undo", async () => {
  const [ownerA, ownerB] = await Promise.all([
    seedActor("+213500000031", "standard"),
    seedActor("+213500000032", "standard"),
  ]);
  const [merchantA, merchantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1713"),
    seedMenuMerchants(ownerB.userId, "1714"),
  ]);
  const categoryA = randomUUID();
  const categoryB = randomUUID();
  const itemA = randomUUID();
  const itemB = randomUUID();
  const { sql } = database.get();
  for (const [merchantId, categoryId, itemId, name] of [
    [merchantA.owned, categoryA, itemA, "Restaurant A item"],
    [merchantB.owned, categoryB, itemB, "Restaurant B item"],
  ] as const) {
    await sql`INSERT INTO public.categories (id, merchant_id, names, sort)
      VALUES (${categoryId}, ${merchantId}, ${JSON.stringify({ fr: "Plats" })}::jsonb, 0)`;
    await sql`INSERT INTO public.items (
        id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min
      ) VALUES (${itemId}, ${merchantId}, ${categoryId}, ${JSON.stringify({ fr: name })}::jsonb,
        ${JSON.stringify({ fr: "Description" })}::jsonb, 500, '{}', 0)`;
  }
  const api = await openApi();
  const baseA = `/v1/merchants/${merchantA.owned}/menu/prices`;
  const baseB = `/v1/merchants/${merchantB.owned}/menu/prices`;
  const mixedInput = {
    itemIds: [itemA, itemB],
    adjustment: { kind: "percent", basisPoints: 1_000 },
    roundingUnit: 10,
    expectedRevision: 0,
  } as const;
  const foreignInput = { ...mixedInput, itemIds: [itemB], expectedRevision: 1 };
  const validBatch = await api.inject({
    method: "POST",
    url: baseB + "/apply",
    headers: {
      ...ownerB.headers,
      "idempotency-key": randomUUID(),
      "x-expected-session-id": ownerB.sessionId,
    },
    payload: { ...mixedInput, itemIds: [itemB] },
  });
  expect(validBatch.statusCode).toBe(201);
  const { batchId } = bulkPriceApplyOutput.parse(validBatch.json());
  const readState = async () => {
    const [prices, history, batches, receipts, revisions] = await Promise.all([
      sql`SELECT id, merchant_id, price_dzd, price_version FROM public.items
        WHERE id IN (${itemA}, ${itemB}) ORDER BY id`,
      sql`SELECT * FROM public.price_history WHERE item_id IN (${itemA}, ${itemB}) ORDER BY item_id`,
      sql`SELECT * FROM public.price_change_batches
        WHERE merchant_id IN (${merchantA.owned}, ${merchantB.owned}) ORDER BY id`,
      sql`SELECT * FROM public.menu_command_receipts
        WHERE merchant_id IN (${merchantA.owned}, ${merchantB.owned}) ORDER BY merchant_id, actor_id, operation`,
      sql`SELECT id, menu_revision FROM public.merchants
        WHERE id IN (${merchantA.owned}, ${merchantB.owned}) ORDER BY id`,
    ]);
    return { prices, history, batches, receipts, revisions };
  };
  const before = await readState();
  expect(before.batches).toHaveLength(1);
  expect(before.receipts).toMatchObject([
    { merchant_id: merchantB.owned, actor_id: ownerB.userId, operation: "bulk_price_apply" },
  ]);

  const preview = await api.inject({
    method: "POST",
    url: baseA + "/preview",
    headers: ownerA.headers,
    payload: {
      itemIds: mixedInput.itemIds,
      adjustment: mixedInput.adjustment,
      roundingUnit: mixedInput.roundingUnit,
    },
  });
  expect(preview.statusCode).toBe(404);
  const apply = await api.inject({
    method: "POST",
    url: baseA + "/apply",
    headers: {
      ...ownerA.headers,
      "idempotency-key": randomUUID(),
      "x-expected-session-id": ownerA.sessionId,
    },
    payload: mixedInput,
  });
  expect(apply.statusCode).toBe(404);

  const foreignPreview = await api.inject({
    method: "POST",
    url: baseB + "/preview",
    headers: ownerA.headers,
    payload: {
      itemIds: foreignInput.itemIds,
      adjustment: foreignInput.adjustment,
      roundingUnit: foreignInput.roundingUnit,
    },
  });
  expect(foreignPreview.statusCode).toBe(404);
  const foreignApply = await api.inject({
    method: "POST",
    url: baseB + "/apply",
    headers: {
      ...ownerA.headers,
      "idempotency-key": randomUUID(),
      "x-expected-session-id": ownerA.sessionId,
    },
    payload: foreignInput,
  });
  expect(foreignApply.statusCode).toBe(404);

  const undo = await api.inject({
    method: "POST",
    url: `${baseA}/batches/${batchId}/undo`,
    headers: {
      ...ownerA.headers,
      "idempotency-key": randomUUID(),
      "x-expected-session-id": ownerA.sessionId,
    },
    payload: { expectedRevision: 0 },
  });
  expect(undo.statusCode).toBe(404);
  expect(undo.body).not.toContain(batchId);
  const foreignUndo = await api.inject({
    method: "POST",
    url: `${baseB}/batches/${batchId}/undo`,
    headers: {
      ...ownerA.headers,
      "idempotency-key": randomUUID(),
      "x-expected-session-id": ownerA.sessionId,
    },
    payload: { expectedRevision: 1 },
  });
  expect(foreignUndo.statusCode).toBe(404);
  expect(foreignUndo.body).not.toContain(batchId);
  expect(await readState()).toEqual(before);
});
