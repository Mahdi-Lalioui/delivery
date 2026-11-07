import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMenuItemRepository } from "../src/menu-item.ts";
import { createMerchantRepository } from "../src/merchant.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-07T12:00:00.000Z");

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

function merchantFixture(serial: number, role: "owner" | "staff" = "owner") {
  return {
    merchantId: fixtureId(serial),
    categoryId: fixtureId(serial + 1),
    alternateCategoryId: fixtureId(serial + 2),
    firstGroup: fixtureId(serial + 3),
    secondGroup: fixtureId(serial + 4),
    firstItem: fixtureId(serial + 5),
    secondItem: fixtureId(serial + 6),
    role,
  };
}

type MerchantFixture = ReturnType<typeof merchantFixture>;

const accountId = fixtureId(2);
const staffMerchantOwner = fixtureId(3);
const editing = merchantFixture(10);
const staffed = merchantFixture(20, "staff");
const lifecycle = merchantFixture(30);
const availability = merchantFixture(40);
const paged = merchantFixture(50);
const blocked = merchantFixture(60);
const rejected = merchantFixture(70);

beforeAll(async () => {
  const { sql } = database.get();
  const communeId = fixtureId(1);
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  await sql`
    insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    values (${communeId}, '1698', 16, 'بلدية تجريبية', 'Commune de test',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  await sql`
    insert into users (id, phone_e164, created_at) values
      (${accountId}, '+213500000002', ${now.toISOString()}::timestamptz),
      (${staffMerchantOwner}, '+213500000003', ${now.toISOString()}::timestamptz)
  `;
  for (const { merchantId, role, categoryId, alternateCategoryId } of [
    editing,
    staffed,
    lifecycle,
    availability,
    paged,
    blocked,
    rejected,
  ]) {
    await sql`
      insert into merchants
        (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
      values (${merchantId}, ${`fixture-${merchantId}`}, 'Restaurant fictif de test', 'Propriétaire de test',
        '+213500000002', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
        array['algerian'], 'approved', ${now.toISOString()}::timestamptz)
    `;
    await sql`
      insert into merchant_members (merchant_id, user_id, role)
      values (${merchantId}, ${accountId}, ${role})
    `;
    await sql`
      insert into categories (id, merchant_id, names, sort) values
        (${categoryId}, ${merchantId}, '{"fr":"Plats"}'::jsonb, 0),
        (${alternateCategoryId}, ${merchantId}, '{"fr":"Desserts"}'::jsonb, 1)
    `;
  }
  await sql`
    insert into merchant_members (merchant_id, user_id, role)
    values (${staffed.merchantId}, ${staffMerchantOwner}, 'owner')
  `;
});

function repository() {
  return createMenuItemRepository(database.get());
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function command<Input, Target extends { merchantId: string; itemId?: string }>(
  target: Target,
  key: string,
  input: Input,
) {
  return {
    ...target,
    accountId,
    now,
    input,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify({ target, input })),
  };
}

function itemData(categoryId: string) {
  const tags: ("spicy" | "new")[] = ["new", "spicy"];
  const optionGroupIds: string[] = [];
  return {
    categoryId,
    names: { ar: "طبق تجريبي", fr: "Plat fictif" },
    descriptions: { fr: "Description fictive" },
    priceDzd: 1_237,
    photoId: null,
    tags,
    extraPrepMinutes: 7,
    optionGroupIds,
  };
}

function itemInput(categoryId: string, expectedRevision: number) {
  return { ...itemData(categoryId), expectedRevision };
}

function page({ merchantId, categoryId }: MerchantFixture) {
  return { merchantId, categoryId, accountId, limit: 10, now };
}

async function seedGroups({ merchantId, firstGroup, secondGroup }: MerchantFixture) {
  await database.get().sql.begin(async (tx) => {
    for (const groupId of [firstGroup, secondGroup]) {
      await tx`
        insert into option_groups (id, merchant_id, names, minimum, maximum)
        values (${groupId}, ${merchantId}, '{"fr":"Garnitures"}'::jsonb, 0, 1)
      `;
      await tx`
        insert into options (merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
        values (${merchantId}, ${groupId}, '{"fr":"Olives"}'::jsonb, 0, false, true, 0)
      `;
    }
  });
}

async function seedItem(
  fixture: MerchantFixture,
  {
    itemId = fixture.firstItem,
    categoryId = fixture.categoryId,
    soldOutUntil = null,
    moderationStatus = "unreviewed",
  }: {
    itemId?: string;
    categoryId?: string;
    soldOutUntil?: Date | null;
    moderationStatus?: string;
  } = {},
) {
  const { sql } = database.get();
  const item = itemData(categoryId);
  await sql`
    insert into items
      (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min,
        is_available, sold_out_until, moderation_status)
    values (${itemId}, ${fixture.merchantId}, ${categoryId}, ${JSON.stringify(item.names)}::jsonb,
      ${JSON.stringify(item.descriptions)}::jsonb, ${item.priceDzd}, ${item.tags}::text[],
      ${item.extraPrepMinutes}, ${soldOutUntil === null}, ${soldOutUntil?.toISOString() ?? null}::timestamptz,
      ${moderationStatus})
  `;
}

test("[MER-09:db] [MER-10:db] item edits preserve integer DZD and only attach local categories and groups in order", async () => {
  const repo = repository();
  await seedGroups(editing);
  await seedGroups(staffed);
  const target = { merchantId: editing.merchantId };
  const values = itemData(editing.categoryId);
  const input = {
    ...values,
    expectedRevision: 0,
    optionGroupIds: [editing.secondGroup, editing.firstGroup],
  };
  expect(
    await repo.create(
      command(target, "foreign-category", { ...input, categoryId: staffed.categoryId }),
    ),
  ).toEqual({
    kind: "not_found",
  });
  expect(
    await repo.create(
      command(target, "foreign-group", {
        ...input,
        optionGroupIds: [editing.firstGroup, staffed.firstGroup],
      }),
    ),
  ).toEqual({
    kind: "not_found",
  });
  expect(
    await repo.create(command(target, "unavailable-photo", { ...input, photoId: fixtureId(99) })),
  ).toEqual({
    kind: "photos_unavailable",
  });
  const created = await repo.create(command(target, "create-item", input));
  expect(created).toMatchObject({
    kind: "applied",
    revision: 1,
    item: {
      ...values,
      optionGroupIds: input.optionGroupIds,
      isAvailable: true,
      soldOutUntil: null,
      moderationStatus: "unreviewed",
    },
  });
  if (created.kind !== "applied") throw new Error("Expected item creation.");
  const { itemId } = created.item;
  const updateTarget = { ...target, itemId };
  const changed = {
    ...input,
    categoryId: editing.alternateCategoryId,
    optionGroupIds: [editing.firstGroup, editing.secondGroup],
    priceDzd: 1_249,
    expectedRevision: 1,
  };
  expect(
    await repo.update(
      command(updateTarget, "foreign-update", {
        ...changed,
        optionGroupIds: [staffed.secondGroup],
      }),
    ),
  ).toEqual({
    kind: "not_found",
  });
  expect(await repo.list(page(editing))).toEqual({
    kind: "listed",
    context: { restaurantName: "Restaurant fictif de test", categoryNames: { fr: "Plats" } },
    revision: 1,
    items: [created.item],
    nextCursor: null,
  });
  const updated = await repo.update(command(updateTarget, "move-item", changed));
  expect(updated).toEqual({
    kind: "applied",
    revision: 2,
    item: {
      ...created.item,
      categoryId: changed.categoryId,
      optionGroupIds: changed.optionGroupIds,
      priceDzd: 1_249,
    },
  });
  const { sql } = database.get();
  expect(
    await sql`
    select price_dzd from items where id = ${itemId}
  `,
  ).toEqual([{ price_dzd: 1_249 }]);
  expect(
    await sql`
    select group_id, sort from item_option_groups where item_id = ${itemId} order by sort
  `,
  ).toEqual([
    { group_id: editing.firstGroup, sort: 0 },
    { group_id: editing.secondGroup, sort: 1 },
  ]);
});

test("[MER-09:db] a duplicate starts available and unreviewed and an archive remains replayable", async () => {
  const repo = repository();
  await seedGroups(lifecycle);
  await seedItem(lifecycle, {
    moderationStatus: "approved",
    soldOutUntil: new Date("2026-11-07T23:00:00.000Z"),
  });
  const { sql } = database.get();
  await sql`
    insert into item_option_groups (merchant_id, item_id, group_id, sort) values
      (${lifecycle.merchantId}, ${lifecycle.firstItem}, ${lifecycle.secondGroup}, 0),
      (${lifecycle.merchantId}, ${lifecycle.firstItem}, ${lifecycle.firstGroup}, 1)
  `;
  const target = { merchantId: lifecycle.merchantId, itemId: lifecycle.firstItem };
  const duplicate = command(target, "duplicate-item", { expectedRevision: 0 });
  const duplicated = await repo.duplicate(duplicate);
  const copied = itemData(lifecycle.categoryId);
  expect(duplicated).toMatchObject({
    kind: "applied",
    revision: 1,
    item: {
      ...copied,
      optionGroupIds: [lifecycle.secondGroup, lifecycle.firstGroup],
      isAvailable: true,
      soldOutUntil: null,
      moderationStatus: "unreviewed",
    },
  });
  if (duplicated.kind !== "applied") throw new Error("Expected a new duplicate item.");
  expect(duplicated.item.itemId).not.toBe(lifecycle.firstItem);
  const beforeArchive = await repo.list(page(lifecycle));
  expect(beforeArchive).toMatchObject({ kind: "listed", revision: 1 });
  if (beforeArchive.kind !== "listed") throw new Error("Expected both items before archiving.");
  expect(beforeArchive.items).toHaveLength(2);
  expect(beforeArchive.items).toContainEqual(duplicated.item);
  expect(beforeArchive.items.find(({ itemId }) => itemId === lifecycle.firstItem)).toMatchObject({
    isAvailable: false,
    moderationStatus: "approved",
  });

  const archive = command(target, "archive-item", { expectedRevision: 1 });
  const archived = {
    kind: "applied",
    revision: 2,
    itemId: lifecycle.firstItem,
    archivedAt: now.toISOString(),
  };
  expect(await repo.archive(archive)).toEqual(archived);
  expect(await repo.archive({ ...archive, now: new Date("2026-11-08T12:00:00.000Z") })).toEqual({
    ...archived,
    kind: "replayed",
  });
  expect(await repo.archive(command(target, "archive-item", { expectedRevision: 2 }))).toEqual({
    kind: "idempotency_conflict",
  });
  expect(await repo.duplicate(duplicate)).toEqual({ ...duplicated, kind: "replayed" });
  expect(
    await repo.update(command(target, "edit-archived", itemInput(lifecycle.categoryId, 2))),
  ).toEqual({
    kind: "not_found",
  });
  expect(await repo.list(page(lifecycle))).toEqual({
    kind: "listed",
    context: { restaurantName: "Restaurant fictif de test", categoryNames: { fr: "Plats" } },
    revision: 2,
    items: [duplicated.item],
    nextCursor: null,
  });
  expect(
    await sql`
      select archived_at = ${now.toISOString()}::timestamptz as archived_at_command_time
      from items where id = ${lifecycle.firstItem}
    `,
  ).toEqual([{ archived_at_command_time: true }]);
});

test.each([
  [blocked, "blocked_pending_review"],
  [rejected, "rejected"],
] as const)(
  "[ADM-04:db] edits and duplicates retain a held item status",
  async (fixture, moderationStatus) => {
    const repo = repository();
    const checklist = createMerchantRepository(database.get());
    const { merchantId, categoryId, firstItem: itemId } = fixture;
    await seedItem(fixture, { moderationStatus });
    const target = { merchantId, itemId };

    const edited = await repo.update(
      command(target, "edit-held-item", {
        ...itemInput(categoryId, 0),
        descriptions: { fr: "Description fictive mise à jour" },
      }),
    );
    expect(edited).toMatchObject({ kind: "applied", item: { moderationStatus } });
    const duplicate = await repo.duplicate(
      command(target, "copy-held-item", { expectedRevision: 1 }),
    );
    expect(duplicate).toMatchObject({ kind: "applied", item: { moderationStatus } });
    await expect(checklist.getOnboarding({ merchantId, accountId })).resolves.toMatchObject({
      itemsTowardMinimum: 0,
    });
  },
);

test("[MER-23:db] staff can toggle availability only for an item at their own merchant", async () => {
  const repo = repository();
  await seedItem(staffed);
  await seedItem(availability, {
    itemId: availability.secondItem,
    categoryId: availability.alternateCategoryId,
  });
  const target = { merchantId: staffed.merchantId, itemId: staffed.firstItem };
  const input = itemInput(staffed.categoryId, 0);
  expect(await repo.list(page(staffed))).toEqual({ kind: "not_found" });
  expect(
    await repo.create(command({ merchantId: staffed.merchantId }, "staff-create", input)),
  ).toEqual({
    kind: "not_found",
  });
  expect(await repo.update(command(target, "staff-edit", input))).toEqual({ kind: "not_found" });
  expect(await repo.duplicate(command(target, "staff-duplicate", { expectedRevision: 0 }))).toEqual(
    {
      kind: "not_found",
    },
  );
  expect(await repo.archive(command(target, "staff-archive", { expectedRevision: 0 }))).toEqual({
    kind: "not_found",
  });

  const soldOut = { expectedRevision: 0, availability: "indefinite" as const };
  expect(
    await repo.setAvailability(
      command({ ...target, itemId: availability.secondItem }, "foreign-toggle", soldOut),
    ),
  ).toEqual({
    kind: "not_found",
  });
  expect(await repo.setAvailability(command(target, "staff-toggle", soldOut))).toEqual({
    kind: "applied",
    revision: 1,
    itemId: staffed.firstItem,
    isAvailable: false,
    soldOutUntil: null,
  });
  expect(
    await repo.list({
      ...page(staffed),
      accountId: staffMerchantOwner,
      now: new Date("2026-11-08T12:00:00.000Z"),
    }),
  ).toMatchObject({
    kind: "listed",
    revision: 1,
    items: [{ itemId: staffed.firstItem, isAvailable: false, soldOutUntil: null }],
  });
  expect(
    await repo.setAvailability(
      command(target, "staff-restock", { expectedRevision: 1, availability: "available" as const }),
    ),
  ).toEqual({
    kind: "applied",
    revision: 2,
    itemId: staffed.firstItem,
    isAvailable: true,
    soldOutUntil: null,
  });
});

test("[MER-09:db] an end-of-day sellout expires exactly at the next midnight in Algiers", async () => {
  const repo = repository();
  await seedItem(availability);
  const target = { merchantId: availability.merchantId, itemId: availability.firstItem };
  const beforeMidnight = new Date("2026-11-07T22:59:59.999Z");
  const midnight = new Date("2026-11-07T23:00:00.000Z");
  const sellOut = {
    ...command(target, "end-of-day", { expectedRevision: 0, availability: "end_of_day" as const }),
    now: beforeMidnight,
  };
  expect(await repo.setAvailability(sellOut)).toEqual({
    kind: "applied",
    revision: 1,
    itemId: availability.firstItem,
    isAvailable: false,
    soldOutUntil: midnight.toISOString(),
  });
  expect(await repo.list({ ...page(availability), now: beforeMidnight })).toMatchObject({
    kind: "listed",
    revision: 1,
    items: [
      { itemId: availability.firstItem, isAvailable: false, soldOutUntil: midnight.toISOString() },
    ],
  });
  expect(await repo.list({ ...page(availability), now: midnight })).toMatchObject({
    kind: "listed",
    revision: 1,
    items: [{ itemId: availability.firstItem, isAvailable: true, soldOutUntil: null }],
  });
  expect(
    await repo.setAvailability({
      ...command(target, "new-day-sellout", {
        expectedRevision: 1,
        availability: "end_of_day" as const,
      }),
      now: midnight,
    }),
  ).toEqual({
    kind: "applied",
    revision: 2,
    itemId: availability.firstItem,
    isAvailable: false,
    soldOutUntil: "2026-11-08T23:00:00.000Z",
  });
});

test("[MER-09:db] item keyset cursors stay within their category and tenant and expire on a revision change", async () => {
  const repo = repository();
  const otherCategoryItem = fixtureId(57);
  await seedItem(paged);
  await seedItem(paged, { itemId: paged.secondItem });
  await seedItem(paged, { itemId: otherCategoryItem, categoryId: paged.alternateCategoryId });
  await seedItem(staffed, { itemId: staffed.secondItem, categoryId: staffed.alternateCategoryId });
  const query = { ...page(paged), limit: 1 };
  expect(await repo.list(query)).toMatchObject({
    kind: "listed",
    context: { restaurantName: "Restaurant fictif de test", categoryNames: { fr: "Plats" } },
    revision: 0,
    items: [{ itemId: paged.firstItem }],
    nextCursor: `0~${paged.firstItem}`,
  });
  const cursor = { revision: 0, itemId: paged.firstItem };
  expect(await repo.list({ ...query, cursor })).toMatchObject({
    kind: "listed",
    context: { restaurantName: "Restaurant fictif de test", categoryNames: { fr: "Plats" } },
    revision: 0,
    items: [{ itemId: paged.secondItem }],
    nextCursor: null,
  });
  expect(await repo.list({ ...query, categoryId: staffed.categoryId })).toEqual({
    kind: "not_found",
  });
  for (const itemId of [otherCategoryItem, staffed.secondItem]) {
    expect(await repo.list({ ...query, cursor: { ...cursor, itemId } })).toEqual({
      kind: "invalid_cursor",
    });
  }
  const target = { merchantId: paged.merchantId, itemId: paged.firstItem };
  const archived = await repo.archive(
    command(target, "archive-first-page", { expectedRevision: 0 }),
  );
  expect(archived).toMatchObject({ kind: "applied", revision: 1 });
  expect(await repo.list({ ...query, cursor })).toEqual({ kind: "revision_conflict" });
  expect(await repo.list(query)).toMatchObject({
    kind: "listed",
    context: { restaurantName: "Restaurant fictif de test", categoryNames: { fr: "Plats" } },
    revision: 1,
    items: [{ itemId: paged.secondItem }],
    nextCursor: null,
  });
});
