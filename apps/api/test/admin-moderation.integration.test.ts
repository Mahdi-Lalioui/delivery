import { randomUUIDv7 } from "node:crypto";
import { adminItemQueueOutput, adminItemReviewOutput } from "@zaafran/contracts/admin-moderation";
import { menuCategoryWriteOutput, menuItemWriteOutput } from "@zaafran/contracts/menu";
import { merchantOnboardingOutput } from "@zaafran/contracts/merchant";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-08T12:00:00.000Z";
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

type Api = Awaited<ReturnType<typeof openApi>>;
type Actor = Awaited<ReturnType<typeof seedActor>>;

function command(api: Api, actor: Actor, request: { url: string; payload: object; key?: string }) {
  return api.inject({
    method: "POST",
    url: request.url,
    headers: {
      ...actor.headers,
      "idempotency-key": request.key ?? randomUUIDv7(),
      "x-expected-session-id": actor.sessionId,
    },
    payload: request.payload,
  });
}

async function createBeer(api: Api, owner: Actor, merchantId: string) {
  const root = `/v1/merchants/${merchantId}/menu`;
  const category = await command(api, owner, {
    url: root + "/categories",
    payload: { names: { fr: "Boissons" }, availability: null, expectedRevision: 0 },
  });
  const { category: created } = menuCategoryWriteOutput.parse(category.json());
  const response = await command(api, owner, {
    url: root + "/items",
    payload: {
      categoryId: created.categoryId,
      names: { ar: "بيرة", fr: "Bière pression" },
      descriptions: { fr: "Pression fictive" },
      priceDzd: 300,
      photoId: null,
      tags: [],
      extraPrepMinutes: 0,
      optionGroupIds: [],
      expectedRevision: 1,
    },
  });
  expect(response.statusCode).toBe(201);
  return menuItemWriteOutput.parse(response.json()).item;
}

async function visibleItems(api: Api, owner: Actor, merchantId: string) {
  const url = `/v1/merchants/${merchantId}/onboarding`;
  const response = await api.inject({ url, headers: owner.headers });
  expect(response.statusCode).toBe(200);
  return merchantOnboardingOutput.parse(response.json()).steps.menu.itemsTowardMinimum;
}

test("[ADM-04:http] a screened item waits in the admin queue until an audited approval lists it", async () => {
  const api = await openApi();
  const owner = await seedActor("+213500000061", "standard");
  const admin = await seedActor("+213500000062", "admin");
  const revokedAdmin = await seedActor("+213500000063", "admin");
  const { owned } = await seedMenuMerchants(owner.userId);

  const beer = await createBeer(api, owner, owned);
  expect(beer.moderationStatus).toBe("blocked_pending_review");
  expect(await visibleItems(api, owner, owned)).toBe(0);

  const queue = await api.inject({
    url: "/v1/admin/menu-items/held?limit=10",
    headers: admin.headers,
  });
  expect(queue.statusCode).toBe(200);
  expect(adminItemQueueOutput.parse(queue.json()).items).toEqual([
    expect.objectContaining({ itemId: beer.itemId, merchantId: owned, matches: ["alcohol"] }),
  ]);

  const review = {
    url: `/v1/admin/menu-items/${beer.itemId}/review`,
    key: randomUUIDv7(),
    payload: { decision: "approve", reason: "Boisson sans alcool vérifiée" },
  };
  const { sql } = database.get();
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  const beforeItem =
    await sql`SELECT to_jsonb(item) AS data FROM public.items AS item WHERE id = ${beer.itemId}`;
  const beforeMerchant = await sql`SELECT menu_revision FROM public.merchants WHERE id = ${owned}`;
  const beforeReceipts = await sql`SELECT to_jsonb(receipt) AS data
    FROM public.item_review_receipts AS receipt WHERE item_id = ${beer.itemId} ORDER BY actor_id, key_hash`;
  const beforeAudit =
    await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`;
  expect(beforeItem).toHaveLength(1);
  expect(beforeReceipts).toHaveLength(0);
  for (const actor of [
    { label: "guest", headers: {}, sessionId: admin.sessionId, expected: 401 },
    { label: "standard", headers: owner.headers, sessionId: owner.sessionId, expected: 403 },
    {
      label: "revoked",
      headers: revokedAdmin.headers,
      sessionId: revokedAdmin.sessionId,
      expected: 401,
    },
  ]) {
    const deniedQueue = await api.inject({
      url: "/v1/admin/menu-items/held?limit=10",
      headers: actor.headers,
    });
    const deniedReview = await api.inject({
      method: "POST",
      url: review.url,
      payload: review.payload,
      headers: {
        ...actor.headers,
        "idempotency-key": randomUUIDv7(),
        "x-expected-session-id": actor.sessionId,
      },
    });
    for (const response of [deniedQueue, deniedReview]) {
      expect(response.statusCode, actor.label).toBe(actor.expected);
      expect(response.json()).toMatchObject({
        code: actor.expected === 401 ? "unauthenticated" : "forbidden",
      });
      expect(response.body).not.toContain(beer.itemId);
      expect(response.body).not.toContain(owned);
      expect(response.body).not.toContain("Bière pression");
    }
    expect(
      await sql`SELECT to_jsonb(item) AS data FROM public.items AS item WHERE id = ${beer.itemId}`,
    ).toEqual(beforeItem);
    expect(await sql`SELECT menu_revision FROM public.merchants WHERE id = ${owned}`).toEqual(
      beforeMerchant,
    );
    expect(
      await sql`SELECT to_jsonb(receipt) AS data
      FROM public.item_review_receipts AS receipt WHERE item_id = ${beer.itemId} ORDER BY actor_id, key_hash`,
    ).toEqual(beforeReceipts);
    expect(
      await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`,
    ).toEqual(beforeAudit);
  }
  const approved = await command(api, admin, review);
  expect(approved.statusCode).toBe(200);
  expect(adminItemReviewOutput.parse(approved.json())).toMatchObject({
    itemId: beer.itemId,
    moderationStatus: "approved",
  });
  const replay = await command(api, admin, review);
  expect(replay.json()).toEqual(approved.json());
  expect(await visibleItems(api, owner, owned)).toBe(1);
  expect(
    await sql`SELECT actor_id, merchant_id, result_status FROM public.item_review_receipts
    WHERE item_id = ${beer.itemId}`,
  ).toEqual([{ actor_id: admin.userId, merchant_id: owned, result_status: "approved" }]);
  expect(
    await sql`SELECT actor_id, merchant_id, reason FROM public.audit_log
    WHERE action = 'item_approved'`,
  ).toEqual([{ actor_id: admin.userId, merchant_id: owned, reason: review.payload.reason }]);

  const ownerReview = await command(api, owner, { ...review, key: randomUUIDv7() });
  expect(ownerReview.statusCode).toBe(403);
});
