import { randomUUIDv7 } from "node:crypto";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { menuPreviewDetailOutput, menuPreviewPageOutput } from "@zaafran/contracts/menu";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(
  "2026-11-20T12:00:00.000Z",
);

async function seedDraft(merchantId: string) {
  const categoryId = randomUUIDv7();
  const itemId = randomUUIDv7();
  const groupId = randomUUIDv7();
  const secretName = "Brouillon " + randomUUIDv7();
  const groupName = "Assortiment " + randomUUIDv7();
  await database.get().sql.begin(async (sql) => {
    await sql`INSERT INTO categories (id, merchant_id, names, sort)
      VALUES (${categoryId}, ${merchantId}, '{"fr":"Spécialités"}', 0)`;
    await sql`INSERT INTO items
      (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min)
      VALUES (${itemId}, ${merchantId}, ${categoryId}, jsonb_build_object('fr', ${secretName}::text),
        '{"fr":"Recette fictive"}', 510, '{}', 0)`;
    await sql`INSERT INTO option_groups (id, merchant_id, names, minimum, maximum)
      VALUES (${groupId}, ${merchantId}, jsonb_build_object('fr', ${groupName}::text), 0, 1)`;
    await sql`INSERT INTO options
      (merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
      VALUES (${merchantId}, ${groupId}, '{"fr":"Citron"}', 10, false, true, 0)`;
    await sql`INSERT INTO item_option_groups (merchant_id, item_id, group_id, sort)
      VALUES (${merchantId}, ${itemId}, ${groupId}, 0)`;
  });
  return { categoryId, itemId, groupId, secretName, groupName };
}

async function readDraft(merchantId: string, draft: Awaited<ReturnType<typeof seedDraft>>) {
  return database.get().sql`
    SELECT m.menu_revision, m.status, to_jsonb(c) AS category, to_jsonb(i) AS item,
      to_jsonb(g) AS option_group, to_jsonb(o) AS option, to_jsonb(link) AS attachment
    FROM merchants m JOIN categories c ON c.merchant_id = m.id
    JOIN items i ON i.category_id = c.id
    JOIN item_option_groups link ON link.item_id = i.id
    JOIN option_groups g ON g.id = link.group_id
    JOIN options o ON o.group_id = g.id
    WHERE m.id = ${merchantId} AND c.id = ${draft.categoryId} AND i.id = ${draft.itemId}
  `;
}

test("[MER-09][AUTH-07] only this restaurant's owner and manager can preview its draft menu", async () => {
  const [owner, otherOwner, manager, staff, customer] = await Promise.all(
    ["081", "082", "083", "084", "085"].map((suffix) =>
      seedActor("+213500000" + suffix, "standard"),
    ),
  );
  if (!owner || !otherOwner || !manager || !staff || !customer) throw new Error("Missing actors");
  const { owned } = await seedMenuMerchants(owner.userId, "1693");
  const { owned: otherRestaurant } = await seedMenuMerchants(otherOwner.userId, "1694");
  await database.get().sql`INSERT INTO merchant_members (merchant_id, user_id, role)
    VALUES (${owned}, ${manager.userId}, 'manager'), (${owned}, ${staff.userId}, 'staff')`;
  const draftA = await seedDraft(owned);
  const draftB = await seedDraft(otherRestaurant);
  const beforeA = await readDraft(owned, draftA);
  const beforeB = await readDraft(otherRestaurant, draftB);
  expect(beforeA).toMatchObject([
    { status: "approved", item: { moderation_status: "unreviewed" } },
  ]);
  expect(beforeB).toMatchObject([
    { status: "approved", item: { moderation_status: "unreviewed" } },
  ]);

  const api = await openApi();
  function preview(
    merchantId: string,
    draft: Awaited<ReturnType<typeof seedDraft>>,
    headers: Record<string, string>,
  ) {
    const path = `/v1/merchants/${merchantId}/menu/preview/items`;
    return Promise.all([
      api.inject({ url: `${path}?categoryId=${draft.categoryId}`, headers }),
      api.inject({ url: `${path}/${draft.itemId}?expectedRevision=0`, headers }),
    ]);
  }

  for (const [restaurant, draft, actor] of [
    [owned, draftA, otherOwner],
    [otherRestaurant, draftB, owner],
    [owned, draftB, owner],
    [otherRestaurant, draftA, otherOwner],
    [owned, draftA, staff],
    [owned, draftA, customer],
  ] as const) {
    for (const response of await preview(restaurant, draft, actor.headers)) {
      expect(response.statusCode).toBe(404);
      expect(problemResponseSchema.parse(response.json()).code).toBe("not_found");
      for (const value of [
        draft.secretName,
        draft.groupName,
        draft.categoryId,
        draft.itemId,
        draft.groupId,
      ]) {
        expect(response.body).not.toContain(value);
      }
    }
  }
  for (const [merchantId, draft, actor] of [
    [owned, draftA, owner],
    [owned, draftA, manager],
    [otherRestaurant, draftB, otherOwner],
  ] as const) {
    const [list, detail] = await preview(merchantId, draft, actor.headers);
    expect(list.statusCode).toBe(200);
    expect(menuPreviewPageOutput.parse(list.json())).toMatchObject({
      sessionId: actor.sessionId,
      revision: 0,
      items: [{ itemId: draft.itemId, names: { fr: draft.secretName } }],
    });
    expect(detail.statusCode).toBe(200);
    expect(menuPreviewDetailOutput.parse(detail.json())).toMatchObject({
      sessionId: actor.sessionId,
      revision: 0,
      item: { itemId: draft.itemId, names: { fr: draft.secretName } },
      optionGroups: [
        {
          optionGroupId: draft.groupId,
          names: { fr: draft.groupName },
          options: [{ names: { fr: "Citron" }, priceDeltaDzd: 10 }],
        },
      ],
    });
  }
  expect(await readDraft(owned, draftA)).toEqual(beforeA);
  expect(await readDraft(otherRestaurant, draftB)).toEqual(beforeB);
});
