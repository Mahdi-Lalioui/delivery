import type { ISql } from "postgres";
import { beforeAll, expect, test } from "vitest";
import { openDatabase } from "../src/database.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = "2026-11-07T12:00:00.000Z";
const names = { fr: "Menu fictif", ar: "قائمة تجريبية" };
const descriptions = { ar: "وصف تجريبي" };

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

const northMerchant = fixtureId(10);
const southMerchant = fixtureId(11);
const northCategory = fixtureId(20);
const southCategory = fixtureId(21);
const breakfastCategory = fixtureId(22);

beforeAll(async () => {
  const { sql } = database.get();
  await sql`
    insert into wilayas (code, name_ar, name_fr)
    values (16, 'ولاية تجريبية', 'Wilaya de test') on conflict (code) do nothing
  `;
  const communeId = fixtureId(1);
  await sql`
    insert into communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    values (${communeId}, '1698', 16, 'بلدية تجريبية', 'Commune de test',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  for (const [merchantId, slug] of [
    [northMerchant, "fictif-north"],
    [southMerchant, "fictif-south"],
  ] as const) {
    await sql`
      insert into merchants
        (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
      values (${merchantId}, ${slug}, 'Restaurant fictif', 'Propriétaire de test',
        '+213500000001', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
        array['algerian'], 'approved', ${now}::timestamptz)
    `;
  }
  await insertCategory(sql, {
    id: northCategory,
    merchantId: northMerchant,
    sort: 0,
    from: "18:00",
    to: "02:00",
  });
  await insertCategory(sql, {
    id: breakfastCategory,
    merchantId: northMerchant,
    sort: 1,
    from: null,
    to: null,
  });
  await insertCategory(sql, {
    id: southCategory,
    merchantId: southMerchant,
    sort: 0,
    from: null,
    to: null,
  });
});

function insertCategory(
  sql: ISql,
  {
    id,
    merchantId,
    sort,
    from,
    to,
  }: {
    id: string;
    merchantId: string;
    sort: number;
    from: string | null;
    to: string | null;
  },
) {
  return sql`
    insert into categories (id, merchant_id, names, sort, available_from, available_to)
    values (${id}, ${merchantId}, ${JSON.stringify(names)}::jsonb, ${sort}, ${from}::time, ${to}::time)
  `;
}

function insertItem(
  sql: ISql,
  {
    id,
    merchantId,
    categoryId,
    priceDzd = 590,
    tags = ["new"],
  }: {
    id: string;
    merchantId: string;
    categoryId: string;
    priceDzd?: number;
    tags?: string[];
  },
) {
  return sql`
    insert into items (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min)
    values (${id}, ${merchantId}, ${categoryId}, ${JSON.stringify(names)}::jsonb, ${JSON.stringify(descriptions)}::jsonb,
      ${priceDzd}, ${tags}::text[], 5)
  `;
}

function insertOption(
  sql: ISql,
  {
    id,
    merchantId,
    groupId,
    sort,
    isDefault = false,
    isAvailable = true,
  }: {
    id: string;
    merchantId: string;
    groupId: string;
    sort: number;
    isDefault?: boolean;
    isAvailable?: boolean;
  },
) {
  return sql`
    insert into options (id, merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
    values (${id}, ${merchantId}, ${groupId}, ${JSON.stringify(names)}::jsonb, 0, ${isDefault}, ${isAvailable}, ${sort})
  `;
}

function insertGroup(
  sql: ISql,
  {
    id,
    merchantId,
    minimum,
    maximum,
  }: {
    id: string;
    merchantId: string;
    minimum: number;
    maximum: number;
  },
) {
  return sql`
    insert into option_groups (id, merchant_id, names, minimum, maximum)
    values (${id}, ${merchantId}, ${JSON.stringify(names)}::jsonb, ${minimum}, ${maximum})
  `;
}

async function createGroup(serial: number, merchantId: string) {
  const groupId = fixtureId(serial);
  await database.get().sql.begin(async (tx) => {
    await insertGroup(tx, { id: groupId, merchantId, minimum: 0, maximum: 1 });
    await insertOption(tx, { id: fixtureId(serial + 1), merchantId, groupId, sort: 0 });
  });
  return groupId;
}

function insertAttachment(
  sql: ISql,
  {
    merchantId,
    itemId,
    groupId,
    sort,
  }: {
    merchantId: string;
    itemId: string;
    groupId: string;
    sort: number;
  },
) {
  return sql`
    insert into item_option_groups (merchant_id, item_id, group_id, sort)
    values (${merchantId}, ${itemId}, ${groupId}, ${sort})
  `;
}

test("[MER-09:db] preserves overnight categories and supports revision-checked position swaps", async () => {
  const { sql } = database.get();

  await expect(
    insertCategory(sql, {
      id: fixtureId(23),
      merchantId: northMerchant,
      sort: 2,
      from: "08:00",
      to: null,
    }),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    insertCategory(sql, {
      id: fixtureId(24),
      merchantId: northMerchant,
      sort: 2,
      from: "24:00",
      to: "02:00",
    }),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    insertCategory(sql, {
      id: fixtureId(25),
      merchantId: northMerchant,
      sort: 0,
      from: null,
      to: null,
    }),
  ).rejects.toMatchObject({ code: "23505" });

  await sql.begin(async (tx) => {
    const [changed] = await tx`
      update merchants set menu_revision = menu_revision + 1
      where id = ${northMerchant} and menu_revision = 0
      returning menu_revision::text as revision
    `;
    expect(changed).toEqual({ revision: "1" });
    await tx`set constraints categories_merchant_sort_key deferred`;
    await tx`update categories set sort = 1 where merchant_id = ${northMerchant} and id = ${northCategory}`;
    await tx`update categories set sort = 0 where merchant_id = ${northMerchant} and id = ${breakfastCategory}`;
  });

  const result = await sql`
    select id, available_from::text as starts, available_to::text as ends
    from categories where merchant_id = ${northMerchant} order by sort, id
  `;
  expect([...result]).toEqual([
    { id: breakfastCategory, starts: null, ends: null },
    { id: northCategory, starts: "18:00:00", ends: "02:00:00" },
  ]);
  expect(
    await sql`
      update merchants set menu_revision = menu_revision + 1
      where id = ${northMerchant} and menu_revision = 0 returning id
    `,
  ).toHaveLength(0);
});

test("[MER-09:db] SQL rejects cross-merchant categories and invalid item attributes", async () => {
  const { sql } = database.get();
  const item = { id: fixtureId(30), merchantId: northMerchant, categoryId: northCategory };

  await expect(insertItem(sql, { ...item, categoryId: southCategory })).rejects.toMatchObject({
    code: "23503",
  });
  await expect(insertItem(sql, { ...item, priceDzd: -1 })).rejects.toMatchObject({ code: "23514" });
  await expect(insertItem(sql, { ...item, tags: ["new", "new"] })).rejects.toMatchObject({
    code: "23514",
  });
  await insertItem(sql, item);
  const [inserted] = await sql`
    select moderation_status, is_available, sold_out_until, archived_at from items where id = ${item.id}
  `;
  expect(inserted).toEqual({
    moderation_status: "unreviewed",
    is_available: true,
    sold_out_until: null,
    archived_at: null,
  });

  await expect(
    sql`update items set names = '{"en":"Only English"}' where id = ${item.id}`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update items set descriptions = '["Not an object"]' where id = ${item.id}`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update items set sold_out_until = ${now}::timestamptz where id = ${item.id}`,
  ).rejects.toMatchObject({ code: "23514" });
  await sql`
    update items set is_available = false, sold_out_until = ${now}::timestamptz,
      archived_at = ${now}::timestamptz where id = ${item.id}
  `;
  const [archived] = await sql`
    select is_available, sold_out_until is not null as timed, archived_at is not null as archived
    from items where id = ${item.id}
  `;
  expect(archived).toEqual({ is_available: false, timed: true, archived: true });
});

test("[MER-10:db] SQL enforces same-merchant option references and reusable ordered attachments", async () => {
  const { sql } = database.get();
  const northItem = fixtureId(40);
  const secondNorthItem = fixtureId(41);
  const southItem = fixtureId(42);
  for (const [id, merchantId, categoryId] of [
    [northItem, northMerchant, northCategory],
    [secondNorthItem, northMerchant, northCategory],
    [southItem, southMerchant, southCategory],
  ] as const) {
    await insertItem(sql, { id, merchantId, categoryId });
  }

  const northGroup = await createGroup(100, northMerchant);
  const extraGroup = await createGroup(110, northMerchant);
  const southGroup = await createGroup(120, southMerchant);
  await expect(
    insertOption(sql, {
      id: fixtureId(130),
      merchantId: northMerchant,
      groupId: southGroup,
      sort: 1,
    }),
  ).rejects.toMatchObject({ code: "23503" });

  const attachment = { merchantId: northMerchant, itemId: northItem, groupId: northGroup, sort: 1 };
  await expect(insertAttachment(sql, { ...attachment, groupId: southGroup })).rejects.toMatchObject(
    {
      code: "23503",
    },
  );
  await expect(insertAttachment(sql, { ...attachment, itemId: southItem })).rejects.toMatchObject({
    code: "23503",
  });
  await insertAttachment(sql, attachment);
  await insertAttachment(sql, { ...attachment, itemId: secondNorthItem, sort: 0 });
  await insertAttachment(sql, { ...attachment, groupId: extraGroup, sort: 0 });
  await expect(insertAttachment(sql, { ...attachment, sort: 2 })).rejects.toMatchObject({
    code: "23505",
  });
  const groups = await sql`
    select group_id from item_option_groups where merchant_id = ${northMerchant}
      and item_id = ${northItem} order by sort, group_id
  `;
  expect([...groups]).toEqual([{ group_id: extraGroup }, { group_id: northGroup }]);
});

test("[MER-10:db] validates real option cardinality while keeping sold-out defaults", async () => {
  const { sql } = database.get();
  const groupId = fixtureId(140);
  const group = { id: groupId, merchantId: northMerchant, minimum: 0, maximum: 1 };
  await expect(insertGroup(sql, { ...group, minimum: 2 })).rejects.toMatchObject({ code: "23514" });
  await expect(insertGroup(sql, group)).rejects.toMatchObject({ code: "23514" });

  const soldOutDefault = fixtureId(141);
  const otherOption = fixtureId(142);
  await sql.begin(async (tx) => {
    await insertGroup(tx, group);
    await insertOption(tx, {
      id: soldOutDefault,
      merchantId: northMerchant,
      groupId,
      sort: 0,
      isDefault: true,
      isAvailable: false,
    });
    await insertOption(tx, { id: otherOption, merchantId: northMerchant, groupId, sort: 1 });
  });
  await expect(
    sql`update options set is_default = true where id = ${otherOption}`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update option_groups set maximum = 3 where id = ${groupId}`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update options set price_delta_dzd = -1 where id = ${otherOption}`,
  ).rejects.toMatchObject({ code: "23514" });
  const options = await sql`
    select id, is_default, is_available from options where merchant_id = ${northMerchant}
      and group_id = ${groupId} order by sort, id
  `;
  expect([...options]).toEqual([
    { id: soldOutDefault, is_default: true, is_available: false },
    { id: otherOption, is_default: false, is_available: true },
  ]);
});

test("[MER-10:db] concurrent defaults cannot exceed the group limit under repeatable read", async () => {
  const { sql } = database.get();
  const groupId = await createGroup(150, northMerchant);
  const firstOption = fixtureId(151);
  const secondOption = fixtureId(152);
  await insertOption(sql, { id: secondOption, merchantId: northMerchant, groupId, sort: 1 });

  const firstWritten = Promise.withResolvers<undefined>();
  const secondRead = Promise.withResolvers<undefined>();
  const releaseFirst = Promise.withResolvers<undefined>();
  const other = openDatabase(database.url());
  const first = sql.begin(async (tx) => {
    await tx`update options set is_default = true where id = ${firstOption}`;
    firstWritten.resolve(undefined);
    await releaseFirst.promise;
  });
  try {
    await Promise.race([firstWritten.promise, first]);
    const second = other.sql.begin("isolation level repeatable read", async (tx) => {
      const [option] = await tx`select is_default from options where id = ${firstOption}`;
      expect(option).toEqual({ is_default: false });
      secondRead.resolve(undefined);
      await tx`update options set is_default = true where id = ${secondOption}`;
    });
    await Promise.race([secondRead.promise, second]);
    releaseFirst.resolve(undefined);
    await first;
    await expect(second).rejects.toMatchObject({ code: "40001" });

    const defaults = await sql`
      select id from options where merchant_id = ${northMerchant} and group_id = ${groupId}
        and is_default
    `;
    expect([...defaults]).toEqual([{ id: firstOption }]);
  } finally {
    releaseFirst.resolve(undefined);
    await Promise.allSettled([first]);
    await other.close();
  }
});
