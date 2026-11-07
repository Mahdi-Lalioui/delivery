import { randomUUIDv7 } from "node:crypto";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuCategoryWriteOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
  menuOptionGroupDetailOutput,
  menuOptionGroupPageOutput,
  menuOptionGroupWriteOutput,
} from "@zaafran/contracts/menu";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const { openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(
  "2026-11-07T12:00:00.000Z",
);

function menuClient(
  api: Awaited<ReturnType<typeof openApi>>,
  actor: Awaited<ReturnType<typeof seedActor>>,
  merchantId: string,
) {
  const root = `/v1/merchants/${merchantId}/menu`;
  return {
    get(path: string) {
      return api.inject({ url: root + path, headers: actor.headers });
    },
    write({
      path,
      payload,
      method = "POST",
      key = randomUUIDv7(),
    }: {
      path: string;
      payload: object;
      method?: "POST" | "PUT";
      key?: string;
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

test("[MER-10:http] [MER-23:http] reuses and edits one option group across two items within the owning restaurant", async () => {
  const api = await openApi();
  const owner = await seedActor("+213500000054", "standard");
  const outsider = await seedActor("+213500000055", "standard");
  const { owned, staffed } = await seedMenuMerchants(owner.userId);
  const { owned: otherOwned } = await seedMenuMerchants(owner.userId, "1603");
  const client = menuClient(api, owner, owned);
  const otherClient = menuClient(api, owner, otherOwned);
  const library = "/option-groups";
  const first = { names: { fr: "Olives" }, priceDeltaDzd: 25, isDefault: false, isAvailable: true };
  const retained = {
    names: { fr: "Harissa" },
    priceDeltaDzd: 0,
    isDefault: true,
    isAvailable: false,
  };
  const group = { names: { ar: "إضافات", fr: "Garnitures" }, minimum: 0, maximum: 2 };
  const create = {
    path: library,
    key: randomUUIDv7(),
    payload: { ...group, options: [first, retained], expectedRevision: 0 },
  };
  const createdResponse = await client.write(create);
  expect(createdResponse.statusCode).toBe(201);
  const created = menuOptionGroupWriteOutput.parse(createdResponse.json());
  const { optionGroupId, options } = created.optionGroup;
  const [removed, kept] = options;
  if (!removed || !kept) throw new Error("Expected both option IDs.");
  expect(created).toEqual({
    revision: 1,
    optionGroup: {
      ...group,
      optionGroupId,
      options: [
        { ...first, optionId: removed.optionId },
        { ...retained, optionId: kept.optionId },
      ],
    },
  });

  const summaryResponse = await client.get(library);
  expect(summaryResponse.statusCode).toBe(200);
  expect(summaryResponse.headers["cache-control"]).toBe("no-store");
  expect(menuOptionGroupPageOutput.parse(summaryResponse.json())).toEqual({
    sessionId: owner.sessionId,
    revision: 1,
    optionGroups: [{ ...group, optionGroupId }],
    nextCursor: null,
  });
  const groupPath = library + "/" + optionGroupId;
  const detail = await client.get(groupPath);
  expect(detail.statusCode).toBe(200);
  expect(menuOptionGroupDetailOutput.parse(detail.json())).toEqual({
    ...created,
    sessionId: owner.sessionId,
  });

  const categoryResponse = await client.write({
    path: "/categories",
    payload: { names: { fr: "Plats" }, availability: null, expectedRevision: 1 },
  });
  expect(categoryResponse.statusCode).toBe(201);
  const { category, revision: categoryRevision } = menuCategoryWriteOutput.parse(
    categoryResponse.json(),
  );
  expect(categoryRevision).toBe(2);
  const { categoryId } = category;
  const itemInput = {
    categoryId,
    descriptions: { fr: "Description fictive" },
    priceDzd: 1_237,
    photoId: null,
    tags: [],
    extraPrepMinutes: 5,
    optionGroupIds: [optionGroupId],
  };
  const firstItemResponse = await client.write({
    path: "/items",
    payload: { ...itemInput, names: { fr: "Plat fictif" }, expectedRevision: 2 },
  });
  const secondItemResponse = await client.write({
    path: "/items",
    payload: { ...itemInput, names: { fr: "Autre plat fictif" }, expectedRevision: 3 },
  });
  expect([firstItemResponse.statusCode, secondItemResponse.statusCode]).toEqual([201, 201]);
  const firstItem = menuItemWriteOutput.parse(firstItemResponse.json());
  const secondItem = menuItemWriteOutput.parse(secondItemResponse.json());
  expect([firstItem.revision, secondItem.revision]).toEqual([3, 4]);
  expect(firstItem.item.itemId).not.toBe(secondItem.item.itemId);
  expect([firstItem.item.optionGroupIds, secondItem.item.optionGroupIds]).toEqual([
    [optionGroupId],
    [optionGroupId],
  ]);

  const fresh = { names: { fr: "Ail" }, priceDeltaDzd: 15, isDefault: false, isAvailable: true };
  const changed = { ...kept, names: { fr: "Harissa douce" }, priceDeltaDzd: 20 };
  const update = {
    method: "PUT",
    path: groupPath,
    key: randomUUIDv7(),
    payload: { ...group, expectedRevision: 4, options: [changed, fresh] },
  } as const;
  const updatedResponse = await client.write(update);
  expect(updatedResponse.statusCode).toBe(200);
  const updated = menuOptionGroupWriteOutput.parse(updatedResponse.json());
  const inserted = updated.optionGroup.options[1];
  if (!inserted) throw new Error("Expected the new option ID.");
  expect([removed.optionId, kept.optionId]).not.toContain(inserted.optionId);
  expect(updated).toEqual({
    revision: 5,
    optionGroup: {
      ...group,
      optionGroupId,
      options: [changed, { ...fresh, optionId: inserted.optionId }],
    },
  });
  const replayCreate = await client.write(create);
  const replayUpdate = await client.write(update);
  expect([replayCreate.statusCode, replayUpdate.statusCode]).toEqual([201, 200]);
  expect(replayCreate.json()).toEqual(created);
  expect(replayUpdate.json()).toEqual(updated);

  const staff = menuClient(api, owner, staffed);
  const unaffiliated = menuClient(api, outsider, owned);
  expect((await staff.get(library)).statusCode).toBe(404);
  expect((await staff.write(create)).statusCode).toBe(404);
  expect((await unaffiliated.get(groupPath)).statusCode).toBe(404);
  const otherList = await otherClient.get(library);
  expect(otherList.statusCode).toBe(200);
  expect(menuOptionGroupPageOutput.parse(otherList.json()).optionGroups).toEqual([]);
  const foreignUpdate = await otherClient.write({
    ...update,
    payload: { ...update.payload, expectedRevision: 0 },
  });
  expect(foreignUpdate.statusCode).toBe(404);
  expect(problemResponseSchema.parse(foreignUpdate.json())).toMatchObject({ code: "not_found" });

  const updatedDetail = await client.get(groupPath);
  expect(updatedDetail.statusCode).toBe(200);
  expect(menuOptionGroupDetailOutput.parse(updatedDetail.json())).toEqual({
    ...updated,
    sessionId: owner.sessionId,
  });
  const listing = await client.get("/items?categoryId=" + categoryId);
  expect(listing.statusCode).toBe(200);
  const listed = menuItemPageOutput.parse(listing.json());
  expect(listed.revision).toBe(5);
  expect(listed.items).toHaveLength(2);
  expect(listed.items).toContainEqual(firstItem.item);
  expect(listed.items).toContainEqual(secondItem.item);
});
