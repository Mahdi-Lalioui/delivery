import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createMediaRepository } from "../src/media.ts";
import { createMenuItemRepository } from "../src/menu-item.ts";
import { createMenuModerationRepository } from "../src/menu-moderation.ts";
import { createMerchantRepository } from "../src/merchant.ts";
import { registerTestDatabase } from "./database.ts";
import { seedReadyPhoto } from "./ready-photo.ts";

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
const screened = merchantFixture(80);
const approved = merchantFixture(90);
const withPhotos = merchantFixture(100);
const withoutPhotos = merchantFixture(110);
const sharedPhoto = merchantFixture(130);

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
    screened,
    approved,
    withPhotos,
    withoutPhotos,
    sharedPhoto,
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
    values (${staffed.merchantId}, ${staffMerchantOwner}, 'owner'),
      (${withPhotos.merchantId}, ${staffMerchantOwner}, 'manager')
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
    descriptions,
  }: {
    itemId?: string;
    categoryId?: string;
    soldOutUntil?: Date | null;
    moderationStatus?: string;
    descriptions?: ReturnType<typeof itemData>["descriptions"];
  } = {},
) {
  const { sql } = database.get();
  const item = itemData(categoryId);
  await sql`
    insert into items
      (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min,
        is_available, sold_out_until, moderation_status)
    values (${itemId}, ${fixture.merchantId}, ${categoryId}, ${JSON.stringify(item.names)}::jsonb,
      ${JSON.stringify(descriptions ?? item.descriptions)}::jsonb, ${item.priceDzd}, ${item.tags}::text[],
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

test("[MER-09:db] ready item photos survive readback, shared edits, duplication and replay", async () => {
  const repo = repository();
  const { merchantId, categoryId } = withPhotos;
  const { sql } = database.get();
  const photoId = fixtureId(120);
  const replacement = fixtureId(121);
  await seedReadyPhoto(sql, { mediaId: photoId, accountId, merchantId, kind: "item", now });
  await seedReadyPhoto(sql, { mediaId: replacement, accountId, merchantId, kind: "item", now });

  const create = command({ merchantId }, "create-photo-item", {
    ...itemInput(categoryId, 0),
    photoId,
  });
  const created = await repo.create(create);
  expect(created).toMatchObject({ kind: "applied", revision: 1, item: { photoId } });
  if (created.kind !== "applied") throw new Error("Expected an item with a photo.");
  const target = { merchantId, itemId: created.item.itemId };
  const edit = { ...itemInput(categoryId, 1), priceDzd: 1300, photoId };

  expect(await repo.list(page(withPhotos))).toMatchObject({ items: [created.item] });
  await expect(
    repo.update({
      ...command(target, "edit-another-photo", { ...edit, photoId: replacement }),
      accountId: staffMerchantOwner,
    }),
  ).resolves.toEqual({ kind: "photos_unavailable" });
  await expect(
    repo.update({ ...command(target, "keep-existing-photo", edit), accountId: staffMerchantOwner }),
  ).resolves.toMatchObject({ kind: "applied", revision: 2, item: { photoId, priceDzd: 1300 } });
  await expect(
    repo.update({
      ...command(target, "keep-photo-legacy-edit", { ...edit, expectedRevision: 2, photoId: null }),
      accountId: staffMerchantOwner,
    }),
  ).resolves.toMatchObject({ kind: "applied", revision: 3, item: { photoId } });

  await expect(
    repo.update(
      command(target, "replace-existing-photo", {
        ...edit,
        expectedRevision: 3,
        photoId: replacement,
      }),
    ),
  ).resolves.toMatchObject({ kind: "applied", revision: 4, item: { photoId: replacement } });
  await expect(
    repo.duplicate({
      ...command(target, "duplicate-photo-item", { expectedRevision: 4 }),
      accountId: staffMerchantOwner,
    }),
  ).resolves.toMatchObject({ kind: "applied", revision: 5, item: { photoId: replacement } });
  await expect(
    repo.update(
      command(target, "remove-item-photo", {
        ...itemInput(categoryId, 5),
        removePhoto: true as const,
      }),
    ),
  ).resolves.toMatchObject({ kind: "applied", revision: 6, item: { photoId: null } });
  await expect(repo.create(create)).resolves.toEqual({ ...created, kind: "replayed" });
  await expect(
    repo.create(
      command({ merchantId }, "create-photo-item", { ...create.input, photoId: replacement }),
    ),
  ).resolves.toEqual({ kind: "idempotency_conflict" });
});

test("[MER-09:db] same-merchant managers can read a ready photo while an active item references it", async () => {
  const repo = repository();
  const connection = database.get();
  const media = createMediaRepository(connection);
  const { sql } = connection;
  const { merchantId, categoryId } = sharedPhoto;
  const photoId = fixtureId(140);
  const replacement = fixtureId(141);
  for (const mediaId of [photoId, replacement]) {
    await seedReadyPhoto(sql, { mediaId, accountId, merchantId, kind: "item", now });
  }

  const sessionId = fixtureId(142);
  await sql`
    insert into public.sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    values (${sessionId}, ${staffMerchantOwner}, ${hash(sessionId)}, 'web', 'standard', '192.0.2.1',
      ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()}::timestamptz + interval '1 hour')
  `;
  const photo = { accountId: staffMerchantOwner, sessionId, mediaId: photoId, now };
  const variant = { format: "webp", width: 160 } as const;
  const assertHidden = async (scope: typeof photo) => {
    await expect(media.read(scope)).resolves.toBeUndefined();
    await expect(media.findVariant({ ...scope, ...variant })).resolves.toBeUndefined();
  };

  const created = await repo.create(
    command({ merchantId }, "create-shared-photo", { ...itemInput(categoryId, 0), photoId }),
  );
  if (created.kind !== "applied") throw new Error("Expected an item with a photo.");
  const target = { merchantId, itemId: created.item.itemId };
  await assertHidden(photo);
  await sql`
    insert into public.merchant_members (merchant_id, user_id, role)
    values (${merchantId}, ${staffMerchantOwner}, 'staff')
  `;
  await assertHidden(photo);
  await sql`
    update public.merchant_members set role = 'manager'
    where merchant_id = ${merchantId} and user_id = ${staffMerchantOwner}
  `;

  const replacementPhoto = { ...photo, mediaId: replacement };
  await assertHidden(replacementPhoto);
  await expect(media.read(photo)).resolves.toMatchObject({
    mediaId: photoId,
    sessionId,
    status: "ready",
  });
  await expect(media.findVariant({ ...photo, ...variant })).resolves.toEqual({
    key: `variants/${photoId}/160.webp`,
  });
  await expect(media.findUpload(photo)).resolves.toBeUndefined();
  await expect(media.findPreview(photo)).resolves.toBeUndefined();
  await expect(
    media.submitCrop({
      ...photo,
      input: { focalX: 5000, focalY: 5000, zoomPercent: 100 },
      idempotencyKeyHash: hash("foreign-crop"),
      requestHash: hash("foreign-crop"),
    }),
  ).resolves.toEqual({ kind: "not_found" });

  await expect(
    repo.update(
      command(target, "replace-shared-photo", {
        ...itemInput(categoryId, 1),
        photoId: replacement,
      }),
    ),
  ).resolves.toMatchObject({ kind: "applied", revision: 2 });
  await assertHidden(photo);
  await expect(media.read(replacementPhoto)).resolves.toMatchObject({ status: "ready" });
  await expect(
    repo.archive(command(target, "archive-shared-photo", { expectedRevision: 2 })),
  ).resolves.toMatchObject({ kind: "applied", revision: 3 });
  await assertHidden(replacementPhoto);
});

test("[MER-09:db] item photo attachment requires the editor, target merchant, item kind and ready state", async () => {
  const repo = repository();
  const { merchantId, categoryId } = withoutPhotos;
  const { sql } = database.get();
  const foreign = fixtureId(122);
  const otherKind = fixtureId(123);
  const pending = fixtureId(124);
  const otherOwner = fixtureId(125);
  const fixture = { accountId, merchantId, kind: "item", now } as const;
  await seedReadyPhoto(sql, { ...fixture, mediaId: foreign, merchantId: editing.merchantId });
  await seedReadyPhoto(sql, { ...fixture, mediaId: otherKind, kind: "cover" });
  await seedReadyPhoto(sql, { ...fixture, mediaId: otherOwner, accountId: staffMerchantOwner });
  await sql`
    insert into media_uploads (id, owner_id, merchant_id, kind, content_type, bytes, created_at)
    values (${pending}, ${accountId}, ${merchantId}, 'item', 'image/png', 16, ${now.toISOString()})
  `;

  const target = { merchantId };
  for (const photoId of [foreign, otherKind, pending, otherOwner]) {
    const input = { ...itemInput(categoryId, 0), photoId };
    await expect(repo.create(command(target, "unavailable-photo", input))).resolves.toEqual({
      kind: "photos_unavailable",
    });
  }
  await expect(repo.list(page(withoutPhotos))).resolves.toMatchObject({ revision: 0, items: [] });
  await expect(
    repo.create(command(target, "unavailable-photo", itemInput(categoryId, 0))),
  ).resolves.toMatchObject({ kind: "applied", revision: 1, item: { photoId: null } });
});

test.each([
  [blocked, "blocked_pending_review"],
  [rejected, "rejected"],
] as const)(
  "[ADM-04:db] allowed edits and duplicates retain the moderation status",
  async (fixture, moderationStatus) => {
    const repo = repository();
    const checklist = createMerchantRepository(database.get());
    const { merchantId, firstItem: itemId } = fixture;
    await seedItem(fixture, { moderationStatus });
    const target = { merchantId, itemId };

    const edited = await repo.update(
      command(target, "edit-held-item", {
        ...itemInput(fixture.alternateCategoryId, 0),
        priceDzd: 1300,
        ...(moderationStatus === "rejected" && { descriptions: { fr: "Description mise à jour" } }),
      }),
    );
    expect(edited).toMatchObject({
      kind: "applied",
      item: { moderationStatus, priceDzd: 1300, categoryId: fixture.alternateCategoryId },
    });
    const duplicate = await repo.duplicate(
      command(target, "copy-held-item", { expectedRevision: 1 }),
    );
    expect(duplicate).toMatchObject({ kind: "applied", item: { moderationStatus } });
    await expect(checklist.getOnboarding({ merchantId, accountId })).resolves.toMatchObject({
      itemsTowardMinimum: 0,
    });
  },
);

test("[ADM-04:db] duplicates of approved items with prohibited text require their own review", async () => {
  const repo = repository();
  const checklist = createMerchantRepository(database.get());
  const { merchantId, firstItem: itemId } = approved;
  const descriptions = { fr: "Dessert fictif au rhum" };
  await seedItem(approved, { moderationStatus: "approved", descriptions });

  const copy = command({ merchantId, itemId }, "copy-approved-item", { expectedRevision: 0 });
  const duplicate = await repo.duplicate(copy);
  expect(duplicate).toMatchObject({
    kind: "applied",
    revision: 1,
    item: { descriptions, moderationStatus: "blocked_pending_review" },
  });
  expect(await repo.duplicate(copy)).toEqual({ ...duplicate, kind: "replayed" });
  await expect(checklist.getOnboarding({ merchantId, accountId })).resolves.toMatchObject({
    itemsTowardMinimum: 1,
  });
});

test("[ADM-04:db] item writes with prohibited words are held for review in the same command", async () => {
  const repo = repository();
  const { merchantId, categoryId, firstItem } = screened;
  await seedItem(screened, { moderationStatus: "approved" });
  const approved = { merchantId, itemId: firstItem };
  const status = (result: Awaited<ReturnType<typeof repo.create>>) =>
    result.kind === "applied" ? result.item.moderationStatus : result.kind;

  const clean = await repo.create(command({ merchantId }, "clean-item", itemInput(categoryId, 0)));
  expect(status(clean)).toBe("unreviewed");
  const heldNames = { fr: "Bière sans alcool" };
  const beer = await repo.create(
    command({ merchantId }, "beer-item", {
      ...itemInput(categoryId, 1),
      names: heldNames,
    }),
  );
  expect(status(beer)).toBe("blocked_pending_review");
  if (clean.kind !== "applied" || beer.kind !== "applied") throw new Error("Expected two items.");

  const cleanTarget = { merchantId, itemId: clean.item.itemId };
  const describedTobacco = await repo.update(
    command(cleanTarget, "tobacco-description", {
      ...itemInput(categoryId, 2),
      descriptions: { ar: "مع سجائر" },
    }),
  );
  expect(status(describedTobacco)).toBe("blocked_pending_review");

  const beerTarget = { merchantId, itemId: beer.item.itemId };
  const { sql } = database.get();
  await sql`INSERT INTO public.admins (user_id, totp_secret_encrypted) VALUES (${staffMerchantOwner}, ${hash("held-review")})`;
  const admin = createMenuModerationRepository(database.get());
  const adminUserId = staffMerchantOwner;
  const queue = await admin.listHeldItems({ adminUserId, limit: 10 });
  expect(queue?.items.find(({ itemId }) => itemId === beerTarget.itemId)).toMatchObject({
    names: heldNames,
  });
  const attemptedText = [
    { names: { fr: "Bière pression" }, descriptions: beer.item.descriptions },
    { names: heldNames, descriptions: { fr: "Contient du rhum" } },
  ];
  for (const [index, text] of attemptedText.entries()) {
    await expect(
      repo.update(
        command(beerTarget, `change-held-text-${String(index)}`, {
          ...itemInput(categoryId, 3),
          ...text,
        }),
      ),
    ).resolves.toEqual({ kind: "moderation_pending" });
  }
  await expect(
    admin.reviewItem({
      adminUserId,
      itemId: beerTarget.itemId,
      decision: "approve",
      reason: "Sans alcool",
      now,
      idempotencyKeyHash: hash("review-beer"),
      requestHash: hash("approve-beer"),
    }),
  ).resolves.toMatchObject({ kind: "reviewed", status: "approved" });
  const listed = await repo.list(page(screened));
  if (listed.kind !== "listed") throw new Error("Expected the approved item in the list.");
  expect(listed.revision).toBe(4);
  expect(listed.items.find(({ itemId }) => itemId === beerTarget.itemId)).toMatchObject({
    names: heldNames,
    descriptions: beer.item.descriptions,
    moderationStatus: "approved",
  });

  const priceOnly = await repo.update(
    command(approved, "approved-price", { ...itemInput(categoryId, 4), priceDzd: 1_300 }),
  );
  expect(status(priceOnly)).toBe("approved");
  const flagged = await repo.update(
    command(approved, "approved-casino", {
      ...itemInput(categoryId, 5),
      names: { fr: "Menu casino" },
    }),
  );
  expect(status(flagged)).toBe("blocked_pending_review");
});

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
