import { menuCategoryPageOutput, menuCategoryWriteOutput } from "@zaafran/contracts/menu";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);
const categoryInput = {
  names: { ar: "أطباق", fr: "Plats" },
  availability: null,
};

test("[MER-08][AUTH-07] real sessions cannot read or mutate another restaurant's categories", async () => {
  const [ownerA, ownerB] = await Promise.all([
    seedActor("+213500000071", "standard"),
    seedActor("+213500000072", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1694"),
    seedMenuMerchants(ownerB.userId, "1695"),
  ]);
  const api = await openApi();
  const path = `/v1/merchants/${restaurantA.owned}/menu/categories`;
  const write = ({
    actor,
    url,
    payload,
    key,
  }: {
    actor: typeof ownerA;
    url: string;
    payload: object;
    key: string;
  }) =>
    api.inject({
      method: "POST",
      url,
      headers: {
        ...actor.headers,
        "idempotency-key": key,
        "x-expected-session-id": actor.sessionId,
      },
      payload,
    });
  const created = await write({
    actor: ownerA,
    url: path,
    payload: { ...categoryInput, expectedRevision: 0 },
    key: "owner-create-category",
  });
  expect(created.statusCode).toBe(201);
  const { category, revision } = menuCategoryWriteOutput.parse(created.json());
  expect(revision).toBe(1);

  const read = await api.inject({ url: path, headers: ownerB.headers });
  expect(read.statusCode).toBe(404);
  expect(read.body).not.toContain(category.categoryId);
  const foreignCreate = await write({
    actor: ownerB,
    url: path,
    payload: { ...categoryInput, expectedRevision: 0 },
    key: "foreign-create-category",
  });
  const foreignRename = await api.inject({
    method: "PUT",
    url: `${path}/${category.categoryId}`,
    headers: {
      ...ownerB.headers,
      "idempotency-key": "foreign-rename-category",
      "x-expected-session-id": ownerB.sessionId,
    },
    payload: { ...categoryInput, expectedRevision: revision },
  });
  const foreignReorder = await api.inject({
    method: "PUT",
    url: `${path}/order`,
    headers: {
      ...ownerB.headers,
      "idempotency-key": "foreign-reorder-category",
      "x-expected-session-id": ownerB.sessionId,
    },
    payload: { categoryIds: [category.categoryId], expectedRevision: revision },
  });
  for (const response of [foreignCreate, foreignRename, foreignReorder]) {
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(category.categoryId);
  }

  const mismatchedRename = await api.inject({
    method: "PUT",
    url: `/v1/merchants/${restaurantB.owned}/menu/categories/${category.categoryId}`,
    headers: {
      ...ownerB.headers,
      "idempotency-key": "mismatched-category-rename",
      "x-expected-session-id": ownerB.sessionId,
    },
    payload: { ...categoryInput, expectedRevision: 0 },
  });
  expect(mismatchedRename.statusCode).toBe(404);
  expect(mismatchedRename.body).not.toContain(category.categoryId);

  const ownPage = await api.inject({ url: path, headers: ownerA.headers });
  expect(menuCategoryPageOutput.parse(ownPage.json()).categories).toMatchObject([category]);
  expect(
    await database.get().sql`
      SELECT names, sort FROM public.categories
      WHERE id = ${category.categoryId} AND merchant_id = ${restaurantA.owned}
    `,
  ).toEqual([{ names: categoryInput.names, sort: 0 }]);
  expect(await database.get().sql`SELECT FROM public.menu_command_receipts`).toHaveLength(1);
  expect(
    (
      await api.inject({
        url: `/v1/merchants/${restaurantB.owned}/menu/categories`,
        headers: ownerA.headers,
      })
    ).statusCode,
  ).toBe(404);
});
