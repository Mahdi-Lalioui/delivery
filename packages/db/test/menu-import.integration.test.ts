import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { openDatabase } from "../src/database.ts";
import { createMenuImportRepository, type ValidatedMenuImportRow } from "../src/menu-import.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-08T12:00:00.000Z");
const id = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const ownerId = id(2);
const managerId = id(3);
const staffId = id(4);
const outsiderId = id(5);
const repo = () => createMenuImportRepository(database.get());
const hash = (value: string) => createHash("sha256").update(value).digest();

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO public.wilayas (code, name_ar, name_fr) VALUES (16, 'تجريبي', 'Test') ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO public.communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${id(1)}, '1699', 16, 'تجريبي', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326))
  `;
  for (const serial of [2, 3, 4, 5]) {
    await sql`
      INSERT INTO public.users (id, phone_e164, created_at)
      VALUES (${id(serial)}, ${`+2135${String(serial).padStart(8, "0")}`}, ${now.toISOString()})
    `;
  }
});

async function merchant(serial: number) {
  const merchantId = id(serial);
  const { sql } = database.get();
  await sql`
    INSERT INTO public.merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    VALUES (${merchantId}, ${`fixture-${serial.toString()}`}, 'Test', 'Fixture', '+213500000000',
      ${id(1)}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ${["algerian"]}, 'approved', ${now.toISOString()})
  `;
  await sql`
    INSERT INTO public.merchant_members (merchant_id, user_id, role)
    VALUES (${merchantId}, ${ownerId}, 'owner'), (${merchantId}, ${managerId}, 'manager'),
      (${merchantId}, ${staffId}, 'staff')
  `;
  return { merchantId, accountId: ownerId, expectedRevision: 0 };
}

function row(externalKey: string, sourceRow = 2): ValidatedMenuImportRow {
  return {
    row: sourceRow,
    externalKey,
    categoryNames: { ar: "أطباق", fr: "Plats" },
    names: { fr: `Plat ${externalKey}` },
    descriptions: { fr: "Description" },
    priceDzd: 500,
  };
}

function command(
  scope: { merchantId: string; accountId: string; expectedRevision: number },
  rows: readonly ValidatedMenuImportRow[],
  key = "import",
) {
  const { expectedRevision, ...identity } = scope;
  const input = { expectedRevision, rows };
  return {
    ...identity,
    input,
    now,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify(input)),
  };
}

async function category(merchantId: string, names: object, sort = 0) {
  const [created] = await database.get().sql<{ id: string }[]>`
    INSERT INTO public.categories (merchant_id, names, sort)
    VALUES (${merchantId}, ${JSON.stringify(names)}::jsonb, ${sort}) RETURNING id
  `;
  if (!created) throw new Error("Missing fixture category.");
  return created.id;
}

test("[MER-12:db] preview matches trimmed NFC category tuples without writing", async () => {
  const scope = await merchant(100);
  await category(scope.merchantId, { ar: "قهوة", fr: " Café " });
  const rows = [
    { ...row("one"), categoryNames: { ar: "قهوة", fr: "Cafe\u0301" } },
    { ...row("two", 3), categoryNames: { ar: "حلويات", fr: "Desserts" } },
    { ...row("three", 4), categoryNames: { ar: " حلويات ", fr: " Desserts " } },
  ];
  expect(await repo().preview({ ...scope, rows })).toEqual({
    kind: "previewed",
    revision: 0,
    errors: [],
    summary: { categoriesCreated: 1, itemsCreated: 3, itemsUpdated: 0, itemsUnchanged: 0 },
  });
  const { sql } = database.get();
  expect(
    await sql`SELECT id FROM public.items WHERE merchant_id = ${scope.merchantId}`,
  ).toHaveLength(0);
  expect(
    await sql`SELECT id FROM public.categories WHERE merchant_id = ${scope.merchantId}`,
  ).toHaveLength(1);
});

test("[MER-12:db] apply creates categories in first input order and unchanged reimport keeps identities", async () => {
  const scope = await merchant(200);
  const rows = [
    { ...row("one"), categoryNames: { fr: "Desserts" } },
    { ...row("two", 3), categoryNames: { ar: "أطباق", fr: "Plats" } },
    { ...row("three", 4), categoryNames: { fr: "Desserts" } },
  ];
  expect(await repo().apply(command(scope, rows))).toEqual({
    kind: "applied",
    revision: 1,
    summary: { categoriesCreated: 2, itemsCreated: 3, itemsUpdated: 0, itemsUnchanged: 0 },
  });
  const { sql } = database.get();
  const before =
    await sql`SELECT id, external_key FROM public.items WHERE merchant_id = ${scope.merchantId} ORDER BY id`;
  const categories =
    await sql`SELECT names, sort FROM public.categories WHERE merchant_id = ${scope.merchantId} ORDER BY sort`;
  expect(categories).toEqual([
    { names: { fr: "Desserts" }, sort: 0 },
    { names: { ar: "أطباق", fr: "Plats" }, sort: 1 },
  ]);
  expect(await repo().apply(command({ ...scope, expectedRevision: 1 }, rows, "again"))).toEqual({
    kind: "applied",
    revision: 2,
    summary: { categoriesCreated: 0, itemsCreated: 0, itemsUpdated: 0, itemsUnchanged: 3 },
  });
  expect(
    await sql`SELECT id, external_key FROM public.items WHERE merchant_id = ${scope.merchantId} ORDER BY id`,
  ).toEqual(before);
});

test("[MER-12:db] updates only imported fields and screens new text while retaining held decisions", async () => {
  const scope = await merchant(300);
  const initial = [row("held"), row("rejected", 3), row("approved", 4)];
  await repo().apply(command(scope, initial));
  const { sql } = database.get();
  await sql`
    UPDATE public.items SET moderation_status = CASE external_key
      WHEN 'held' THEN 'blocked_pending_review' WHEN 'rejected' THEN 'rejected' ELSE 'approved' END,
      tags = ARRAY['spicy'], prep_extra_min = 7, is_available = false,
      sold_out_until = ${new Date(now.getTime() + 60_000).toISOString()}
    WHERE merchant_id = ${scope.merchantId}
  `;
  const groupId = id(310);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO public.option_groups (id, merchant_id, names, minimum, maximum)
      VALUES (${groupId}, ${scope.merchantId}, '{"fr":"Accompagnement"}', 0, 1)`;
    await tx`INSERT INTO public.options (merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
      VALUES (${scope.merchantId}, ${groupId}, '{"fr":"Frites"}', 100, false, true, 0)`;
    await tx`INSERT INTO public.item_option_groups (merchant_id, item_id, group_id, sort)
      SELECT merchant_id, id, ${groupId}, 0 FROM public.items
      WHERE merchant_id = ${scope.merchantId} AND external_key = 'held'`;
  });
  const rows: ValidatedMenuImportRow[] = initial.map((item) => ({
    ...item,
    priceDzd: 600,
    categoryNames: { fr: "Nouveau" },
    descriptions: item.externalKey === "held" ? item.descriptions : { fr: "Bière" },
  }));
  rows.push({ ...row("new", 5), names: { fr: "Cigarettes" } });
  expect(
    await repo().apply(command({ ...scope, expectedRevision: 1 }, rows, "update")),
  ).toMatchObject({
    kind: "applied",
    revision: 2,
    summary: { categoriesCreated: 1, itemsCreated: 1, itemsUpdated: 3, itemsUnchanged: 0 },
  });
  const items = await sql`
    SELECT external_key, price_dzd, tags, prep_extra_min, is_available,
      sold_out_until IS NOT NULL AS has_stock_deadline, moderation_status
    FROM public.items WHERE merchant_id = ${scope.merchantId} ORDER BY external_key
  `;
  expect(
    await sql`SELECT group_id, sort FROM public.item_option_groups
    WHERE merchant_id = ${scope.merchantId}`,
  ).toEqual([{ group_id: groupId, sort: 0 }]);
  expect(items).toMatchObject([
    {
      external_key: "approved",
      price_dzd: 600,
      tags: ["spicy"],
      prep_extra_min: 7,
      is_available: false,
      has_stock_deadline: true,
      moderation_status: "blocked_pending_review",
    },
    { external_key: "held", price_dzd: 600, moderation_status: "blocked_pending_review" },
    { external_key: "new", moderation_status: "blocked_pending_review" },
    { external_key: "rejected", price_dzd: 600, moderation_status: "rejected" },
  ]);
});

test("[ADM-04:db] an import cannot replace held text or apply any other rows in that batch", async () => {
  const scope = await merchant(320);
  const held = { ...row("held"), names: { fr: "Bière sans alcool" } };
  await expect(repo().apply(command(scope, [held]))).resolves.toMatchObject({
    kind: "applied",
    revision: 1,
  });
  const live = { ...scope, expectedRevision: 1 };
  const second = { ...row("second", 3), categoryNames: { fr: "Nouveau" } };
  const errors = [{ row: 2, field: "external_key", reason: "moderation_pending" }];
  for (const changed of [
    { ...held, names: { fr: "Bière pression" } },
    { ...held, descriptions: { fr: "Contient du rhum" } },
  ]) {
    const rows = [second, changed];
    await expect(repo().preview({ ...live, rows })).resolves.toMatchObject({
      kind: "previewed",
      errors,
    });
    await expect(repo().apply(command(live, rows, "replace-held"))).resolves.toEqual({
      kind: "import_conflict",
      errors,
    });
  }
  const { sql } = database.get();
  await expect(
    sql`SELECT names FROM public.categories WHERE merchant_id = ${scope.merchantId}`,
  ).resolves.toEqual([{ names: held.categoryNames }]);
  await expect(sql`SELECT external_key, names, descriptions, price_dzd, moderation_status
    FROM public.items WHERE merchant_id = ${scope.merchantId}`).resolves.toEqual([
    {
      external_key: "held",
      names: held.names,
      descriptions: held.descriptions,
      price_dzd: held.priceDzd,
      moderation_status: "blocked_pending_review",
    },
  ]);
  const priceOnly = [{ ...held, priceDzd: 600 }];
  await expect(repo().preview({ ...live, rows: priceOnly })).resolves.toMatchObject({ errors: [] });
  await expect(repo().apply(command(live, priceOnly, "replace-held"))).resolves.toMatchObject({
    kind: "applied",
    revision: 2,
    summary: { itemsUpdated: 1 },
  });
  await expect(
    sql`SELECT price_dzd, moderation_status FROM public.items WHERE merchant_id = ${scope.merchantId}`,
  ).resolves.toEqual([{ price_dzd: 600, moderation_status: "blocked_pending_review" }]);
});

test("[MER-12:db] archived external keys remain reserved and reject the entire import", async () => {
  const scope = await merchant(400);
  await repo().apply(command(scope, [row("reserved")]));
  const { sql } = database.get();
  await sql`UPDATE public.items SET archived_at = ${now.toISOString()} WHERE merchant_id = ${scope.merchantId}`;
  const rows = [row("reserved"), row("new", 3)];
  const error = { row: 2, field: "external_key", reason: "archived_key" };
  expect(await repo().preview({ ...scope, expectedRevision: 1, rows })).toMatchObject({
    errors: [error],
  });
  expect(await repo().apply(command({ ...scope, expectedRevision: 1 }, rows, "archived"))).toEqual({
    kind: "import_conflict",
    errors: [error],
  });
  expect(
    await sql`SELECT id FROM public.items WHERE merchant_id = ${scope.merchantId}`,
  ).toHaveLength(1);
  await expect(sql`
    INSERT INTO public.items (merchant_id, category_id, external_key, names, descriptions, price_dzd, tags, prep_extra_min)
    SELECT merchant_id, category_id, external_key, names, descriptions, price_dzd, tags, prep_extra_min
    FROM public.items WHERE merchant_id = ${scope.merchantId}
  `).rejects.toMatchObject({ code: "23505" });
});

test("[MER-12:db] ambiguous normalized category names are reported on their source row", async () => {
  const scope = await merchant(500);
  await category(scope.merchantId, { ar: "قهوة", fr: "Café" }, 0);
  await category(scope.merchantId, { ar: " قهوة ", fr: "Cafe\u0301" }, 1);
  const rows = [{ ...row("ambiguous", 9), categoryNames: { ar: "قهوة", fr: "Café" } }];
  const errors = [{ row: 9, field: "category_ar", reason: "ambiguous_category" }];
  expect(await repo().preview({ ...scope, rows })).toMatchObject({ errors });
  expect(await repo().apply(command(scope, rows))).toEqual({ kind: "import_conflict", errors });
});

test("[MER-12:db] category matching compares the complete Arabic and French tuple", async () => {
  const scope = await merchant(600);
  await category(scope.merchantId, { ar: "أطباق", fr: "Plats" });
  const rows = [{ ...row("different"), categoryNames: { ar: "حلويات", fr: "Plats" } }];
  expect(await repo().apply(command(scope, rows))).toMatchObject({
    kind: "applied",
    summary: { categoriesCreated: 1, itemsCreated: 1 },
  });
});

test("[MER-12:db] the category limit rejects a batch before inserting any items", async () => {
  const scope = await merchant(700);
  const { sql } = database.get();
  await sql`
    INSERT INTO public.categories (merchant_id, names, sort)
    SELECT ${scope.merchantId}, jsonb_build_object('fr', 'Category ' || serial), serial - 1
    FROM generate_series(1, 1000) AS serial
  `;
  const rows = [row("over-limit")];
  const errors = [{ row: 2, field: "category_ar", reason: "category_limit" }];
  expect(await repo().preview({ ...scope, rows })).toMatchObject({ errors });
  expect(await repo().apply(command(scope, rows))).toEqual({ kind: "import_conflict", errors });
  expect(
    await sql`SELECT id FROM public.items WHERE merchant_id = ${scope.merchantId}`,
  ).toHaveLength(0);
});

test("[MER-12:db] tenant role and revision checks apply even to an empty authorization preview", async () => {
  const scope = await merchant(800);
  for (const accountId of [staffId, outsiderId]) {
    expect(await repo().preview({ ...scope, accountId, rows: [] })).toEqual({ kind: "not_found" });
    expect(await repo().apply(command({ ...scope, accountId }, [row("denied")]))).toEqual({
      kind: "not_found",
    });
  }
  expect(await repo().preview({ ...scope, expectedRevision: 1, rows: [] })).toEqual({
    kind: "revision_conflict",
  });
  expect(await repo().apply(command({ ...scope, expectedRevision: 1 }, [row("stale")]))).toEqual({
    kind: "revision_conflict",
  });
  expect(
    await repo().apply(command({ ...scope, accountId: managerId }, [row("manager")])),
  ).toMatchObject({ kind: "applied" });
  const other = await merchant(810);
  expect(await repo().apply(command(other, [row("manager")]))).toMatchObject({ kind: "applied" });
});

test("[MER-12:db] concurrent exact import replay writes one batch and rejects a changed request", async () => {
  const scope = await merchant(900);
  const request = command(scope, [row("once")]);
  const connection = openDatabase(database.url());
  try {
    const results = await Promise.all([
      repo().apply(request),
      createMenuImportRepository(connection).apply(request),
    ]);
    expect(results.map(({ kind }) => kind).sort()).toEqual(["applied", "replayed"]);
    expect(results[1]).toMatchObject({ revision: 1 });
  } finally {
    await connection.close();
  }
  expect(await repo().apply({ ...request, requestHash: hash("changed") })).toEqual({
    kind: "idempotency_conflict",
  });
  const { sql } = database.get();
  expect(
    await sql`SELECT id FROM public.items WHERE merchant_id = ${scope.merchantId}`,
  ).toHaveLength(1);
  expect(
    await sql`SELECT * FROM public.menu_command_receipts WHERE merchant_id = ${scope.merchantId}`,
  ).toHaveLength(1);
});

test("[MER-12:db] receipt failure rolls back imported categories, items and revision", async () => {
  const scope = await merchant(1000);
  const request = command(scope, [row("rollback")]);
  const { sql } = database.get();
  await sql`CREATE FUNCTION fail_fixture_import_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture import receipt failure'; END $$`;
  await sql`CREATE TRIGGER fail_fixture_import_receipt BEFORE INSERT ON public.menu_command_receipts
    FOR EACH ROW EXECUTE FUNCTION fail_fixture_import_receipt()`;
  try {
    await expect(repo().apply(request)).rejects.toThrow("fixture import receipt failure");
  } finally {
    await sql`DROP TRIGGER fail_fixture_import_receipt ON public.menu_command_receipts`;
    await sql`DROP FUNCTION fail_fixture_import_receipt()`;
  }
  expect(
    await sql`SELECT id FROM public.items WHERE merchant_id = ${scope.merchantId}`,
  ).toHaveLength(0);
  expect(
    await sql`SELECT id FROM public.categories WHERE merchant_id = ${scope.merchantId}`,
  ).toHaveLength(0);
  expect(await repo().preview({ ...scope, rows: [] })).toMatchObject({ revision: 0 });
  expect(await repo().apply(request)).toMatchObject({ kind: "applied", revision: 1 });
});
