import { randomUUIDv7 } from "node:crypto";
import { menuCategoryWriteOutput, menuItemWriteOutput } from "@zaafran/contracts/menu";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-08T12:00:00.000Z";
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

type Api = Awaited<ReturnType<typeof openApi>>;
type Actor = Awaited<ReturnType<typeof seedActor>>;

function send(
  api: Api,
  actor: Actor,
  request: { method: "POST" | "PUT"; url: string; payload: object },
) {
  return api.inject({
    ...request,
    headers: {
      ...actor.headers,
      "idempotency-key": randomUUIDv7(),
      "x-expected-session-id": actor.sessionId,
    },
  });
}

function category(expectedRevision: number) {
  return { names: { fr: "Plats" }, availability: null, expectedRevision };
}

async function statusOf(response: Promise<{ statusCode: number }>) {
  return (await response).statusCode;
}

// M2 slice of MER-23. The live board (M4-6) extends this test with the staff board rights.
test("[MER-23] owner, manager and staff get exactly their rights at their own restaurant only", async () => {
  const api = await openApi();
  const owner = await seedActor("+213550000091", "standard");
  const manager = await seedActor("+213550000092", "standard");
  const staff = await seedActor("+213550000093", "standard");
  const outsider = await seedActor("+213550000094", "standard");
  const { owned: merchantId } = await seedMenuMerchants(owner.userId, "1605");
  const { owned: otherMerchantId } = await seedMenuMerchants(outsider.userId, "1606");
  const { sql } = database.get();
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role)
    VALUES (${merchantId}, ${manager.userId}, 'manager'), (${merchantId}, ${staff.userId}, 'staff')`;
  const root = `/v1/merchants/${merchantId}`;
  const list = (actor: Actor, url = root + "/staff") => api.inject({ url, headers: actor.headers });

  // Staff management: the owner only.
  expect(await statusOf(list(owner))).toBe(200);
  for (const actor of [manager, staff, outsider]) expect(await statusOf(list(actor))).toBe(404);
  expect(await statusOf(list(outsider, `/v1/merchants/${otherMerchantId}/staff`))).toBe(200);
  expect(await statusOf(list(owner, `/v1/merchants/${otherMerchantId}/staff`))).toBe(404);

  // Menu writes: owner and manager.
  const write = (actor: Actor, revision: number, merchant = root) =>
    send(api, actor, {
      method: "POST",
      url: merchant + "/menu/categories",
      payload: category(revision),
    });
  const first = await write(owner, 0);
  expect(first.statusCode).toBe(201);
  const { category: created } = menuCategoryWriteOutput.parse(first.json());
  expect(await statusOf(write(manager, 1))).toBe(201);
  expect(await statusOf(write(staff, 2))).toBe(404);
  expect(await statusOf(write(outsider, 2))).toBe(404);
  for (const actor of [owner, manager, staff]) {
    expect(await statusOf(write(actor, 0, `/v1/merchants/${otherMerchantId}`))).toBe(404);
  }

  // Sold-out toggle: every role at the restaurant, nobody else.
  const item = await send(api, owner, {
    method: "POST",
    url: root + "/menu/items",
    payload: {
      categoryId: created.categoryId,
      names: { fr: "Plat fictif" },
      descriptions: { fr: "Description fictive" },
      priceDzd: 900,
      photoId: null,
      tags: [],
      extraPrepMinutes: 0,
      optionGroupIds: [],
      expectedRevision: 2,
    },
  });
  expect(item.statusCode).toBe(201);
  const { item: written } = menuItemWriteOutput.parse(item.json());
  const toggle = (actor: Actor, revision: number, availability: string) =>
    send(api, actor, {
      method: "PUT",
      url: `${root}/menu/items/${written.itemId}/availability`,
      payload: { availability, expectedRevision: revision },
    });
  expect(await statusOf(toggle(staff, 3, "indefinite"))).toBe(200);
  expect(await statusOf(toggle(manager, 4, "available"))).toBe(200);
  expect(await statusOf(toggle(owner, 5, "end_of_day"))).toBe(200);
  expect(await statusOf(toggle(outsider, 6, "available"))).toBe(404);
});
