import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { openDatabase } from "../src/database.ts";
import { createMenuCategoryRepository } from "../src/menu-category.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-07T12:00:00.000Z");

function fixtureId(serial: number): string {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

const accountId = fixtureId(2);
const ownedMerchant = fixtureId(10);
const staffedMerchant = fixtureId(11);
const managedMerchant = fixtureId(12);
const pagedMerchant = fixtureId(13);
const concurrentMerchant = fixtureId(14);
const firstCategory = fixtureId(20);
const staffedCategory = fixtureId(21);
const secondCategory = fixtureId(22);
const thirdCategory = fixtureId(23);

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
    insert into users (id, phone_e164, created_at)
    values (${accountId}, '+213500000002', ${now.toISOString()}::timestamptz)
  `;
  for (const [merchantId, role] of [
    [ownedMerchant, "owner"],
    [staffedMerchant, "staff"],
    [managedMerchant, "manager"],
    [pagedMerchant, "owner"],
    [concurrentMerchant, "owner"],
  ] as const) {
    await sql`
      insert into merchants
        (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
      values (${merchantId}, ${`fixture-${merchantId}`}, 'Restaurant fictif de test', 'Propriétaire de test',
        '+213500000002', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
        array['algerian'], 'approved', ${now.toISOString()}::timestamptz)
    `;
    await sql`insert into merchant_members (merchant_id, user_id, role) values (${merchantId}, ${accountId}, ${role})`;
  }
  for (const [id, merchantId, sort, label] of [
    [firstCategory, ownedMerchant, 0, "Entrées"],
    [staffedCategory, staffedMerchant, 0, "Menu privé"],
    [fixtureId(24), pagedMerchant, 0, "Entrées"],
    [secondCategory, pagedMerchant, 1, "Plats"],
    [thirdCategory, pagedMerchant, 2, "Desserts"],
  ] as const) {
    await sql`
      insert into categories (id, merchant_id, names, sort)
      values (${id}, ${merchantId}, ${JSON.stringify({ fr: label })}::jsonb, ${sort})
    `;
  }
});

function repository() {
  return createMenuCategoryRepository(database.get());
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function command<Input>(
  { merchantId, key, categoryId }: { merchantId: string; key: string; categoryId?: string },
  input: Input,
) {
  return {
    accountId,
    merchantId,
    now,
    input,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify({ merchantId, categoryId, input })),
  };
}

test("[MER-09:db] [MER-23:db] listing uses the role held at the target merchant", async () => {
  const repo = repository();
  expect(await repo.list({ accountId, merchantId: ownedMerchant, limit: 10 })).toMatchObject({
    kind: "listed",
    revision: 0,
    categories: [{ categoryId: firstCategory, position: 0 }],
    nextCursor: null,
  });
  expect(await repo.list({ accountId, merchantId: managedMerchant, limit: 10 })).toMatchObject({
    kind: "listed",
  });
  expect(await repo.list({ accountId, merchantId: staffedMerchant, limit: 10 })).toEqual({
    kind: "not_found",
  });
});

test("[MER-09:db] [MER-23:db] writes enforce both membership and category ownership", async () => {
  const repo = repository();
  const input = {
    names: { fr: "Modification interdite" },
    availability: null,
    expectedRevision: 0,
  };

  expect(
    await repo.create(command({ merchantId: staffedMerchant, key: "staff-create" }, input)),
  ).toEqual({
    kind: "not_found",
  });
  expect(
    await repo.rename({
      ...command(
        { merchantId: staffedMerchant, key: "staff-rename", categoryId: staffedCategory },
        input,
      ),
      categoryId: staffedCategory,
    }),
  ).toEqual({ kind: "not_found" });
  expect(
    await repo.reorder(
      command(
        { merchantId: staffedMerchant, key: "staff-reorder" },
        {
          categoryIds: [staffedCategory],
          expectedRevision: 0,
        },
      ),
    ),
  ).toEqual({ kind: "not_found" });
  expect(
    await repo.rename({
      ...command(
        { merchantId: ownedMerchant, key: "foreign-rename", categoryId: staffedCategory },
        input,
      ),
      categoryId: staffedCategory,
    }),
  ).toEqual({ kind: "not_found" });
  expect(
    await repo.reorder(
      command(
        { merchantId: ownedMerchant, key: "foreign-reorder" },
        {
          categoryIds: [staffedCategory],
          expectedRevision: 0,
        },
      ),
    ),
  ).toEqual({ kind: "invalid_order" });

  const { sql } = database.get();
  expect(
    await sql`
    select menu_revision::integer as revision from merchants
    where id in (${ownedMerchant}, ${staffedMerchant}) order by id
  `,
  ).toEqual([{ revision: 0 }, { revision: 0 }]);
  expect(
    await sql`
    select id, names, sort from categories
    where merchant_id in (${ownedMerchant}, ${staffedMerchant}) order by id
  `,
  ).toEqual([
    { id: firstCategory, names: { fr: "Entrées" }, sort: 0 },
    { id: staffedCategory, names: { fr: "Menu privé" }, sort: 0 },
  ]);
});

test("[MER-09:db] a retry returns the original category and revision after a later rename", async () => {
  const repo = repository();
  const create = command(
    { merchantId: managedMerchant, key: "manager-create" },
    {
      names: { ar: "أطباق", fr: "Plats" },
      availability: { from: "18:00", to: "02:00" },
      expectedRevision: 0,
    },
  );
  const created = await repo.create(create);
  expect(created).toMatchObject({
    kind: "applied",
    revision: 1,
    category: { names: create.input.names, availability: create.input.availability, position: 0 },
  });
  if (created.kind !== "applied") throw new Error("Expected manager category creation.");
  const { categoryId } = created.category;
  const rename = {
    ...command(
      { merchantId: managedMerchant, key: "manager-rename", categoryId },
      { names: { fr: "Plats du soir" }, availability: null, expectedRevision: 1 },
    ),
    categoryId,
  };
  const renamed = await repo.rename(rename);
  expect(renamed).toEqual({
    kind: "applied",
    revision: 2,
    category: { categoryId, names: rename.input.names, availability: null, position: 0 },
  });

  expect(await repo.create(create)).toEqual({ ...created, kind: "replayed" });
  expect(await repo.rename(rename)).toEqual({ ...renamed, kind: "replayed" });
  expect(
    await repo.create(
      command(
        { merchantId: managedMerchant, key: "manager-create" },
        { ...create.input, names: { fr: "Autre" } },
      ),
    ),
  ).toEqual({ kind: "idempotency_conflict" });
  expect(
    await repo.create(
      command({ merchantId: managedMerchant, key: "new-key-stale-revision" }, create.input),
    ),
  ).toEqual({
    kind: "revision_conflict",
  });
  expect(await repo.list({ accountId, merchantId: managedMerchant, limit: 10 })).toEqual({
    kind: "listed",
    revision: 2,
    categories: [{ categoryId, names: rename.input.names, availability: null, position: 0 }],
    nextCursor: null,
  });
});

test("[MER-09:db] concurrent writers with the same revision apply exactly one command", async () => {
  const secondConnection = openDatabase(database.url());
  try {
    const repo = repository();
    const secondRepo = createMenuCategoryRepository(secondConnection);
    const left = command(
      { merchantId: concurrentMerchant, key: "race-left" },
      {
        names: { fr: "Salades" },
        availability: null,
        expectedRevision: 0,
      },
    );
    const right = command(
      { merchantId: concurrentMerchant, key: "race-right" },
      {
        names: { fr: "Soupes" },
        availability: null,
        expectedRevision: 0,
      },
    );
    const results = await Promise.all([repo.create(left), secondRepo.create(right)]);
    expect(results.map(({ kind }) => kind).sort()).toEqual(["applied", "revision_conflict"]);
    const winner = results.find(({ kind }) => kind === "applied");
    if (winner?.kind !== "applied") throw new Error("Expected exactly one category creation.");
    expect(winner.revision).toBe(1);
    expect(winner.category.position).toBe(0);
    expect(await repo.list({ accountId, merchantId: concurrentMerchant, limit: 10 })).toEqual({
      kind: "listed",
      revision: 1,
      categories: [winner.category],
      nextCursor: null,
    });
  } finally {
    await secondConnection.close();
  }
});

test("[MER-09:db] keyset pages follow category order and expire when it changes", async () => {
  const repo = repository();
  const page = { accountId, merchantId: pagedMerchant, limit: 2 };
  const pageFirstCategory = fixtureId(24);
  expect(await repo.list(page)).toMatchObject({
    kind: "listed",
    revision: 0,
    categories: [
      { categoryId: pageFirstCategory, position: 0 },
      { categoryId: secondCategory, position: 1 },
    ],
    nextCursor: `0~1~${secondCategory}`,
  });
  const cursor = { revision: 0, position: 1, categoryId: secondCategory };
  expect(await repo.list({ ...page, cursor })).toMatchObject({
    kind: "listed",
    revision: 0,
    categories: [{ categoryId: thirdCategory, position: 2 }],
    nextCursor: null,
  });

  expect(
    await repo.reorder(
      command(
        { merchantId: pagedMerchant, key: "partial-order" },
        {
          categoryIds: [secondCategory, pageFirstCategory],
          expectedRevision: 0,
        },
      ),
    ),
  ).toEqual({ kind: "invalid_order" });

  const categoryIds = [thirdCategory, secondCategory, pageFirstCategory];
  const reorder = command(
    { merchantId: pagedMerchant, key: "reverse-order" },
    { categoryIds, expectedRevision: 0 },
  );
  expect(await repo.reorder(reorder)).toEqual({ kind: "applied", revision: 1, categoryIds });
  expect(await repo.reorder(reorder)).toEqual({ kind: "replayed", revision: 1, categoryIds });
  expect(await repo.list({ ...page, cursor })).toEqual({ kind: "revision_conflict" });
  expect(await repo.list(page)).toMatchObject({
    kind: "listed",
    revision: 1,
    categories: [
      { categoryId: thirdCategory, position: 0 },
      { categoryId: secondCategory, position: 1 },
    ],
    nextCursor: `1~1~${secondCategory}`,
  });
  expect(await repo.list({ ...page, cursor: { ...cursor, revision: 1 } })).toMatchObject({
    kind: "listed",
    revision: 1,
    categories: [{ categoryId: pageFirstCategory, position: 2 }],
    nextCursor: null,
  });
});
