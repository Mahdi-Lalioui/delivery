import { randomUUIDv7 } from "node:crypto";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuCategoryWriteOutput,
  menuItemArchiveOutput,
  menuItemAvailabilityOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
} from "@zaafran/contracts/menu";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-07T22:59:59.999Z";
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

function menuClient(
  api: Awaited<ReturnType<typeof openApi>>,
  actor: Awaited<ReturnType<typeof seedActor>>,
  merchantId: string,
) {
  const root = `/v1/merchants/${merchantId}/menu`;
  return {
    listItems(categoryId: string, query: Record<string, string> = {}) {
      const search = new URLSearchParams({ categoryId, ...query });
      return api.inject({ url: `${root}/items?${search.toString()}`, headers: actor.headers });
    },
    write({
      path,
      method = "POST",
      key = randomUUIDv7(),
      payload,
    }: {
      path: string;
      method?: "POST" | "PUT";
      key?: string;
      payload: object;
    }) {
      return api.inject({
        method,
        url: root + path,
        headers: {
          ...actor.headers,
          "idempotency-key": key,
          "x-expected-session-id": actor.sessionId,
        },
        payload,
      });
    },
  };
}

async function createCategory(client: ReturnType<typeof menuClient>) {
  const response = await client.write({
    path: "/categories",
    payload: { names: { ar: "أطباق", fr: "Plats" }, availability: null, expectedRevision: 0 },
  });
  expect(response.statusCode).toBe(201);
  const { category, revision } = menuCategoryWriteOutput.parse(response.json());
  expect(revision).toBe(1);
  return category.categoryId;
}

function newItem(categoryId: string) {
  return {
    categoryId,
    names: { ar: "طبق تجريبي", fr: "Plat fictif" },
    descriptions: { ar: "وصف تجريبي", fr: "Description fictive" },
    priceDzd: 1_237,
    photoId: null,
    tags: ["spicy"],
    extraPrepMinutes: 7,
    optionGroupIds: [],
    expectedRevision: 1,
  };
}

test("[MER-09:http] edits, duplicates and archives items with the stored menu revision", async () => {
  const api = await openApi();
  const actor = await seedActor("+213500000051", "standard");
  const { owned, staffed } = await seedMenuMerchants(actor.userId);
  const client = menuClient(api, actor, owned);
  const categoryId = await createCategory(client);
  const input = newItem(categoryId);
  const created = await client.write({ path: "/items", payload: input });
  expect(created.statusCode).toBe(201);
  const first = menuItemWriteOutput.parse(created.json());
  expect(first).toMatchObject({
    revision: 2,
    item: { categoryId, names: input.names, descriptions: input.descriptions, priceDzd: 1_237 },
  });
  const itemPath = "/items/" + first.item.itemId;
  const edit = {
    ...input,
    names: { ...input.names, fr: "Plat du soir" },
    priceDzd: 1_249,
    expectedRevision: 2,
  };
  const edited = await client.write({ method: "PUT", path: itemPath, payload: edit });
  expect(edited.statusCode).toBe(200);
  const updated = menuItemWriteOutput.parse(edited.json());
  expect(updated).toEqual({
    revision: 3,
    item: { ...first.item, names: edit.names, priceDzd: 1_249 },
  });
  const duplicate = await client.write({
    path: itemPath + "/duplicate",
    payload: { expectedRevision: 3 },
  });
  expect(duplicate.statusCode).toBe(201);
  const copied = menuItemWriteOutput.parse(duplicate.json());
  expect(copied.item.itemId).not.toBe(first.item.itemId);
  expect(copied).toEqual({ revision: 4, item: { ...updated.item, itemId: copied.item.itemId } });

  const listed = await client.listItems(categoryId, { limit: "1" });
  expect(listed.statusCode).toBe(200);
  expect(listed.headers["cache-control"]).toBe("no-store");
  const firstPage = menuItemPageOutput.parse(listed.json());
  expect(firstPage).toMatchObject({
    sessionId: actor.sessionId,
    revision: 4,
    items: [updated.item],
  });
  if (!firstPage.nextCursor) throw new Error("Expected a second item page.");
  const nextPage = { limit: "1", cursor: firstPage.nextCursor };
  expect(menuItemPageOutput.parse((await client.listItems(categoryId, nextPage)).json())).toEqual({
    sessionId: actor.sessionId,
    revision: 4,
    items: [copied.item],
    nextCursor: null,
  });
  const foreign = await menuClient(api, actor, staffed).listItems(categoryId);
  expect(foreign.statusCode).toBe(404);

  const archive = {
    path: itemPath + "/archive",
    key: randomUUIDv7(),
    payload: { expectedRevision: 4 },
  };
  const archived = await client.write(archive);
  expect(archived.statusCode).toBe(200);
  expect(menuItemArchiveOutput.parse(archived.json())).toEqual({
    revision: 5,
    itemId: first.item.itemId,
    archivedAt: now,
  });
  const replay = await client.write(archive);
  expect(replay.statusCode).toBe(200);
  expect(replay.json()).toEqual(archived.json());
  expect(
    problemResponseSchema.parse((await client.listItems(categoryId, nextPage)).json()),
  ).toMatchObject({
    status: 409,
    code: "revision_conflict",
  });
  expect(menuItemPageOutput.parse((await client.listItems(categoryId)).json())).toEqual({
    sessionId: actor.sessionId,
    revision: 5,
    items: [copied.item],
    nextCursor: null,
  });
});

test("[MER-09:http] [MER-23:http] staff receives only availability fields on their own restaurant's sold-out toggle", async () => {
  let clock = now;
  const api = await openApi(() => new Date(clock));
  const staff = await seedActor("+213500000052", "standard");
  const owner = await seedActor("+213500000053", "standard");
  const { owned, staffed } = await seedMenuMerchants(staff.userId, "1603");
  const { sql } = database.get();
  await sql`
    insert into merchant_members (merchant_id, user_id, role) values (${staffed}, ${owner.userId}, 'owner')
  `;
  const ownerClient = menuClient(api, owner, staffed);
  const categoryId = await createCategory(ownerClient);
  const created = await ownerClient.write({ path: "/items", payload: newItem(categoryId) });
  expect(created.statusCode).toBe(201);
  const { item, revision } = menuItemWriteOutput.parse(created.json());
  const staffClient = menuClient(api, staff, staffed);
  expect((await staffClient.listItems(categoryId)).statusCode).toBe(404);
  expect(
    (
      await staffClient.write({
        method: "PUT",
        path: "/items/" + item.itemId,
        payload: { ...newItem(categoryId), expectedRevision: revision, priceDzd: 3 },
      })
    ).statusCode,
  ).toBe(404);

  const soldOut = {
    method: "PUT",
    path: "/items/" + item.itemId + "/availability",
    payload: { availability: "end_of_day", expectedRevision: revision },
  } as const;
  const otherClient = menuClient(api, staff, owned);
  expect(
    (await otherClient.write({ ...soldOut, payload: { ...soldOut.payload, expectedRevision: 0 } }))
      .statusCode,
  ).toBe(404);
  const toggle = await staffClient.write(soldOut);
  expect(toggle.statusCode).toBe(200);
  const midnight = "2026-11-07T23:00:00.000Z";
  expect(menuItemAvailabilityOutput.parse(toggle.json())).toEqual({
    itemId: item.itemId,
    isAvailable: false,
    soldOutUntil: midnight,
    revision: 3,
  });
  expect(menuItemPageOutput.parse((await ownerClient.listItems(categoryId)).json()).items).toEqual([
    { ...item, isAvailable: false, soldOutUntil: midnight },
  ]);
  clock = midnight;
  expect(menuItemPageOutput.parse((await ownerClient.listItems(categoryId)).json())).toMatchObject({
    revision: 3,
    items: [item],
  });
  expect((await staffClient.listItems(categoryId)).statusCode).toBe(404);
});
