import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMenuItemRepository } from "../src/menu-item.ts";
import { createMenuOptionGroupRepository } from "../src/menu-option-group.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-07T12:00:00.000Z");
const restaurantName = "Restaurant fictif de test";

function fixtureId(serial: number) {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

const accountId = fixtureId(2);
const secondOwner = fixtureId(3);
const ownedMerchant = fixtureId(10);
const staffedMerchant = fixtureId(11);
const managedMerchant = fixtureId(12);
const editingMerchant = fixtureId(13);
const validationMerchant = fixtureId(14);
const pagedMerchant = fixtureId(15);
const foreignMerchant = fixtureId(16);
const foreignGroup = fixtureId(20);
const foreignOption = fixtureId(21);

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
      (${secondOwner}, '+213500000003', ${now.toISOString()}::timestamptz)
  `;
  for (const [merchantId, role] of [
    [ownedMerchant, "owner"],
    [staffedMerchant, "staff"],
    [managedMerchant, "manager"],
    [editingMerchant, "owner"],
    [validationMerchant, "owner"],
    [pagedMerchant, "owner"],
    [foreignMerchant, "owner"],
  ] as const) {
    await sql`
      insert into merchants
        (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
      values (${merchantId}, ${`fixture-${merchantId}`}, ${restaurantName}, 'Propriétaire de test',
        '+213500000002', ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
        array['algerian'], 'approved', ${now.toISOString()}::timestamptz)
    `;
    await sql`insert into merchant_members (merchant_id, user_id, role) values (${merchantId}, ${accountId}, ${role})`;
  }
  await sql`insert into merchant_members (merchant_id, user_id, role) values (${staffedMerchant}, ${secondOwner}, 'owner')`;
  await sql.begin(async (tx) => {
    await tx`
      insert into option_groups (id, merchant_id, names, minimum, maximum)
      values (${foreignGroup}, ${foreignMerchant}, '{"fr":"Groupe distinct"}'::jsonb, 0, 1)
    `;
    await tx`
      insert into options (id, merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
      values (${foreignOption}, ${foreignMerchant}, ${foreignGroup}, '{"fr":"Option distincte"}'::jsonb, 0, false, true, 0)
    `;
  });
});

function repository() {
  return createMenuOptionGroupRepository(database.get());
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function command<Input, Target extends { merchantId: string; optionGroupId?: string }>(
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

function groupInput(expectedRevision: number) {
  return {
    names: { ar: "إضافات", fr: "Garnitures" },
    minimum: 0,
    maximum: 1,
    options: [{ names: { fr: "Olives" }, priceDeltaDzd: 25, isDefault: false, isAvailable: true }],
    expectedRevision,
  };
}

type CreateCommand = Parameters<ReturnType<typeof repository>["create"]>[0];

async function createGroup(request: CreateCommand) {
  const result = await repository().create(request);
  if (result.kind !== "applied") throw new Error(`Expected group creation, got ${result.kind}.`);
  return result;
}

test("[MER-10:db] [MER-23:db] only owners and managers can use the target restaurant's option library", async () => {
  const repo = repository();
  const input = groupInput(0);
  expect(await repo.list({ accountId, merchantId: ownedMerchant, limit: 10 })).toEqual({
    kind: "listed",
    context: { restaurantName },
    revision: 0,
    optionGroups: [],
    nextCursor: null,
  });
  const managed = await repo.create(
    command({ merchantId: managedMerchant }, "manager-create", input),
  );
  expect(managed).toMatchObject({ kind: "applied", revision: 1 });
  const staffedTarget = { merchantId: staffedMerchant };
  const other = await repo.create({
    ...command(staffedTarget, "other-owner-create", input),
    accountId: secondOwner,
  });
  if (other.kind !== "applied") throw new Error("Expected owner to create a group.");
  const { optionGroupId } = other.optionGroup;
  expect(await repo.list({ ...staffedTarget, accountId, limit: 10 })).toEqual({
    kind: "not_found",
  });
  expect(await repo.detail({ ...staffedTarget, accountId, optionGroupId })).toEqual({
    kind: "not_found",
  });
  expect(await repo.create(command(staffedTarget, "staff-create", groupInput(1)))).toEqual({
    kind: "not_found",
  });
  expect(
    await repo.update(command({ ...staffedTarget, optionGroupId }, "staff-update", groupInput(1))),
  ).toEqual({ kind: "not_found" });
  expect(await repo.detail({ ...staffedTarget, accountId: secondOwner, optionGroupId })).toEqual({
    kind: "found",
    revision: 1,
    optionGroup: other.optionGroup,
  });
});

test("[MER-10:db] editing a shared group preserves kept option IDs and both item attachments", async () => {
  const repo = repository();
  const target = { merchantId: editingMerchant };
  const first = { names: { fr: "Olives" }, priceDeltaDzd: 25, isDefault: false, isAvailable: true };
  const unavailableDefault = {
    names: { fr: "Harissa" },
    priceDeltaDzd: 0,
    isDefault: true,
    isAvailable: false,
  };
  const removed = {
    names: { fr: "Citron" },
    priceDeltaDzd: 10,
    isDefault: false,
    isAvailable: true,
  };
  const initial = { ...groupInput(0), maximum: 2, options: [first, unavailableDefault, removed] };
  const created = await createGroup(command(target, "create-shared-group", initial));
  expect(created.revision).toBe(1);
  const { optionGroupId, options } = created.optionGroup;
  const [firstOption, defaultOption, removedOption] = options;
  if (!firstOption || !defaultOption || !removedOption)
    throw new Error("Expected all three options.");
  expect(new Set(options.map(({ optionId }) => optionId)).size).toBe(3);
  expect(options).toEqual([
    { ...first, optionId: firstOption.optionId },
    { ...unavailableDefault, optionId: defaultOption.optionId },
    { ...removed, optionId: removedOption.optionId },
  ]);
  const unrelated = await createGroup(command(target, "create-unrelated-group", groupInput(1)));
  const unrelatedId = unrelated.optionGroup.optionGroupId;

  const { sql } = database.get();
  const categoryId = fixtureId(30);
  await sql`
    insert into categories (id, merchant_id, names, sort)
    values (${categoryId}, ${editingMerchant}, '{"fr":"Plats"}'::jsonb, 0)
  `;
  const items = createMenuItemRepository(database.get());
  const itemInput = {
    categoryId,
    names: { fr: "Plat fictif" },
    descriptions: { fr: "Description fictive" },
    priceDzd: 590,
    photoId: null,
    tags: [],
    extraPrepMinutes: 0,
  };
  const firstItem = await items.create(
    command(target, "attach-shared-first", {
      ...itemInput,
      expectedRevision: 2,
      optionGroupIds: [unrelatedId, optionGroupId],
    }),
  );
  const secondItem = await items.create(
    command(target, "attach-shared-second", {
      ...itemInput,
      expectedRevision: 3,
      optionGroupIds: [optionGroupId],
    }),
  );
  if (firstItem.kind !== "applied" || secondItem.kind !== "applied")
    throw new Error("Expected two items to reuse the group.");

  const newOption = {
    names: { fr: "Ail" },
    priceDeltaDzd: 15,
    isDefault: false,
    isAvailable: true,
  };
  const changedFirst = { ...firstOption, names: { fr: "Olives vertes" }, priceDeltaDzd: 35 };
  const update = command({ ...target, optionGroupId }, "edit-shared-group", {
    ...initial,
    names: { ar: "إضافات", fr: "Sauces et garnitures" },
    minimum: 1,
    expectedRevision: 4,
    options: [defaultOption, changedFirst, newOption],
  });
  const edited = await repo.update(update);
  expect(edited).toMatchObject({
    kind: "applied",
    revision: 5,
    optionGroup: { optionGroupId, names: update.input.names, minimum: 1, maximum: 2 },
  });
  if (edited.kind !== "applied") throw new Error("Expected shared group edit.");
  const added = edited.optionGroup.options[2];
  if (!added) throw new Error("Expected a generated option ID.");
  expect(added.optionId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(options.map(({ optionId }) => optionId)).not.toContain(added.optionId);
  expect(edited.optionGroup.options).toEqual([
    defaultOption,
    changedFirst,
    { ...newOption, optionId: added.optionId },
  ]);
  expect(await repo.detail({ ...target, accountId, optionGroupId })).toEqual({
    kind: "found",
    revision: 5,
    optionGroup: edited.optionGroup,
  });
  expect(
    await sql`
    select id, sort from options where merchant_id = ${editingMerchant} and group_id = ${optionGroupId}
    order by sort
  `,
  ).toEqual([
    { id: defaultOption.optionId, sort: 0 },
    { id: firstOption.optionId, sort: 1 },
    { id: added.optionId, sort: 2 },
  ]);
  const listed = await items.list({ ...target, accountId, categoryId, limit: 10, now });
  if (listed.kind !== "listed") throw new Error("Expected items after shared group edit.");
  expect(listed.revision).toBe(5);
  expect(listed.items).toHaveLength(2);
  expect(listed.items).toContainEqual(firstItem.item);
  expect(listed.items).toContainEqual(secondItem.item);
});

test("[MER-10:db] an option ID from another group or tenant rolls the whole edit back", async () => {
  const repo = repository();
  const target = { merchantId: validationMerchant };
  const created = await createGroup(command(target, "target-group", groupInput(0)));
  const sibling = await createGroup(command(target, "sibling-group", groupInput(1)));
  const [existing] = created.optionGroup.options;
  const [siblingOption] = sibling.optionGroup.options;
  if (!existing || !siblingOption) throw new Error("Expected options in both fixtures.");
  const updateTarget = { ...target, optionGroupId: created.optionGroup.optionGroupId };
  const editedOption = { ...existing, priceDeltaDzd: 85 };
  const input = {
    ...groupInput(2),
    names: { fr: "Nom modifié" },
    options: [editedOption],
  };
  for (const optionId of [siblingOption.optionId, foreignOption]) {
    expect(
      await repo.update(
        command(updateTarget, "retry-after-rejection", {
          ...input,
          options: [editedOption, { ...editedOption, optionId }],
        }),
      ),
    ).toEqual({ kind: "not_found" });
    expect(await repo.detail({ ...updateTarget, accountId })).toEqual({
      kind: "found",
      revision: 2,
      optionGroup: created.optionGroup,
    });
  }
  expect(
    await repo.detail({ ...target, accountId, optionGroupId: sibling.optionGroup.optionGroupId }),
  ).toEqual({
    kind: "found",
    revision: 2,
    optionGroup: sibling.optionGroup,
  });
  expect(await repo.detail({ ...target, accountId, optionGroupId: foreignGroup })).toEqual({
    kind: "not_found",
  });
  expect(await repo.update(command(updateTarget, "retry-after-rejection", input))).toMatchObject({
    kind: "applied",
    revision: 3,
    optionGroup: { names: input.names, options: [editedOption] },
  });
});

test("[MER-10:db] pagination and commands are revision-bound while exact retries keep the original result", async () => {
  const repo = repository();
  const target = { merchantId: pagedMerchant };
  const initial = command(target, "original-group", groupInput(0));
  const first = await createGroup(initial);
  const second = await createGroup(
    command(target, "second-group", { ...groupInput(1), names: { fr: "Sauces" } }),
  );
  const { options: firstOptions, ...firstSummary } = first.optionGroup;
  const { options: secondOptions, ...secondSummary } = second.optionGroup;
  expect(secondOptions).toHaveLength(1);
  const [earlier, later] =
    firstSummary.optionGroupId < secondSummary.optionGroupId
      ? ([firstSummary, secondSummary] as const)
      : ([secondSummary, firstSummary] as const);
  const query = { ...target, accountId, limit: 1 };
  const cursor = { revision: 2, optionGroupId: earlier.optionGroupId };
  expect(await repo.list(query)).toEqual({
    kind: "listed",
    context: { restaurantName },
    revision: 2,
    optionGroups: [earlier],
    nextCursor: `2~${earlier.optionGroupId}`,
  });
  expect(await repo.list({ ...query, cursor })).toEqual({
    kind: "listed",
    context: { restaurantName },
    revision: 2,
    optionGroups: [later],
    nextCursor: null,
  });
  expect(await repo.list({ ...query, cursor: { ...cursor, optionGroupId: foreignGroup } })).toEqual(
    { kind: "invalid_cursor" },
  );

  const updateTarget = { ...target, optionGroupId: firstSummary.optionGroupId };
  const input = { ...groupInput(2), names: { fr: "Garnitures du soir" }, options: firstOptions };
  const update = command(updateTarget, "rename-group", input);
  const changed = await repo.update(update);
  expect(changed).toMatchObject({
    kind: "applied",
    revision: 3,
    optionGroup: { ...first.optionGroup, names: input.names },
  });
  expect(await repo.list({ ...query, cursor })).toEqual({ kind: "revision_conflict" });
  expect(await repo.update(command(updateTarget, "stale-update", input))).toEqual({
    kind: "revision_conflict",
  });
  expect(await repo.create(initial)).toEqual({ ...first, kind: "replayed" });
  expect(await repo.update(update)).toEqual({ ...changed, kind: "replayed" });
  expect(
    await repo.create(
      command(target, "original-group", { ...initial.input, names: { fr: "Autre" } }),
    ),
  ).toEqual({ kind: "idempotency_conflict" });
  expect(await repo.detail({ ...updateTarget, accountId })).toEqual({
    kind: "found",
    revision: 3,
    optionGroup: { ...first.optionGroup, names: input.names },
  });
});
