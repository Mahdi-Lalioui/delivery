import { randomUUIDv7 } from "node:crypto";
import { adminItemQueueOutput, adminItemReviewOutput } from "@zaafran/contracts/admin-moderation";
import { menuCategoryWriteOutput, menuItemWriteOutput } from "@zaafran/contracts/menu";
import { merchantOnboardingOutput } from "@zaafran/contracts/merchant";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-08T12:00:00.000Z";
const { openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

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
  const approved = await command(api, admin, review);
  expect(approved.statusCode).toBe(200);
  expect(adminItemReviewOutput.parse(approved.json())).toMatchObject({
    itemId: beer.itemId,
    moderationStatus: "approved",
  });
  const replay = await command(api, admin, review);
  expect(replay.json()).toEqual(approved.json());
  expect(await visibleItems(api, owner, owned)).toBe(1);

  const ownerReview = await command(api, owner, { ...review, key: randomUUIDv7() });
  expect(ownerReview.statusCode).toBe(403);
});
