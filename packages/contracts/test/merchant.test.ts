import { expect, test } from "vitest";
import {
  communeListOutput,
  communeListQuery,
  merchantApplicationInput,
  merchantApplicationOutput,
  merchantMembershipsOutput,
} from "../src/merchant.ts";

function fixtureId(serial: number): string {
  return `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
}

const communeId = fixtureId(1);
const merchantId = fixtureId(2);
const application = {
  restaurantName: "Table de la Casbah",
  ownerName: "صاحب المطعم التجريبي",
  communeId,
  pin: { latitude: 36.7631, longitude: 3.0562 },
  cuisines: ["algerian"],
};

test("[MER-01:contract] accepts signup with or without optional registration and photos", () => {
  expect(merchantApplicationInput.parse(application)).toEqual(application);
  const photoIds = [10, 11, 12, 13, 14].map(fixtureId);
  const optional = { rcNumber: "22B1234567", photoIds };
  expect(
    merchantApplicationInput.parse({ ...application, ...optional, rcNumber: " 22B1234567 " }),
  ).toEqual({ ...application, ...optional });
  expect(merchantApplicationInput.parse({ ...application, photoIds: [] })).toEqual({
    ...application,
    photoIds: [],
  });
});

test("[MER-01:contract] requires applicant fields and rejects caller-controlled identity or status", () => {
  for (const fields of [
    { restaurantName: "" },
    { restaurantName: "x\0y" },
    { ownerName: "" },
    { ownerName: "x\0y" },
    { communeId: "not-a-uuid" },
    { role: "owner" },
    { phone: "+213500000000" },
    { ownerId: fixtureId(3) },
    { status: "active" },
    { rcNumber: " \t " },
    { rcNumber: "x\0y" },
    { rcNumber: null },
  ]) {
    expect(
      merchantApplicationInput.safeParse({ ...application, ...fields }).success,
      JSON.stringify(fields),
    ).toBe(false);
  }
  expect(
    merchantApplicationInput.safeParse({ restaurantName: application.restaurantName }).success,
  ).toBe(false);
});

test("[MER-01:contract] requires a strict pin with finite numeric latitude and longitude", () => {
  for (const pin of [
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
  ]) {
    expect(merchantApplicationInput.parse({ ...application, pin }).pin).toEqual(pin);
  }
  for (const pin of [
    { latitude: 90.01, longitude: 0 },
    { latitude: -90.01, longitude: 0 },
    { latitude: 0, longitude: 180.01 },
    { latitude: 0, longitude: -180.01 },
    { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity },
    { latitude: "36.7631", longitude: 3.0562 },
    { latitude: 36.7631 },
    { ...application.pin, accuracyMeters: 5 },
  ]) {
    expect(
      merchantApplicationInput.safeParse({ ...application, pin }).success,
      JSON.stringify(pin),
    ).toBe(false);
  }
});

test("[MER-01:contract] accepts one to five unique lowercase cuisine slugs", () => {
  const cuisines = ["algerian", "grill", "fried-chicken", "pizza", "seafood"];
  expect(merchantApplicationInput.parse({ ...application, cuisines }).cuisines).toEqual(cuisines);

  for (const invalid of [
    [],
    [...cuisines, "pastry"],
    ["grill", "grill"],
    ["Grill"],
    ["fast food"],
    ["pizza/seafood"],
    [""],
  ]) {
    expect(
      merchantApplicationInput.safeParse({ ...application, cuisines: invalid }).success,
      JSON.stringify(invalid),
    ).toBe(false);
  }
});

test("[MER-01:contract] rejects invalid, repeated and excess photo references", () => {
  for (const photoIds of [
    ["not-a-uuid"],
    [fixtureId(10), fixtureId(10)],
    [10, 11, 12, 13, 14, 15].map(fixtureId),
    null,
  ]) {
    expect(merchantApplicationInput.safeParse({ ...application, photoIds }).success).toBe(false);
  }
});

test("[MER-01:contract] exposes the merchant UUID and pending review status after signup", () => {
  const result = { merchantId, status: "pending_review" };
  expect(merchantApplicationOutput.parse(result)).toEqual(result);
  for (const invalid of [
    { ...result, merchantId: "not-a-uuid" },
    { ...result, status: "approved" },
    { ...result, ownerId: fixtureId(3) },
  ]) {
    expect(merchantApplicationOutput.safeParse(invalid).success).toBe(false);
  }
});

const commune = {
  id: communeId,
  code: "0101",
  wilayaCode: 1,
  nameAr: "بلدية الاختبار",
  nameFr: "Commune de test",
};

test("[MER-01:contract] paginates commune records with bilingual names and four-digit codes", () => {
  const page = {
    communes: [commune, { ...commune, id: fixtureId(4), code: "6901", wilayaCode: 69 }],
    nextCursor: "next:6901",
  };
  expect(communeListOutput.parse(page)).toEqual(page);
  expect(communeListOutput.parse({ communes: [], nextCursor: null })).toEqual({
    communes: [],
    nextCursor: null,
  });
  expect(communeListOutput.safeParse({ ...page, nextCursor: 6901 }).success).toBe(false);
});

test("[MER-01:contract] rejects invalid commune codes and wilaya ranges", () => {
  for (const invalid of [
    { id: "not-a-uuid" },
    { code: "101" },
    { code: "01010" },
    { code: "01A1" },
    { code: "٠١٠١" },
    { code: 101 },
    { wilayaCode: 0 },
    { wilayaCode: 70 },
    { wilayaCode: 1.5 },
    { wilayaCode: "1" },
    { nameAr: null },
    { nameFr: 1 },
    { centroid: { latitude: 36.7631, longitude: 3.0562 } },
  ]) {
    expect(
      communeListOutput.safeParse({ communes: [{ ...commune, ...invalid }], nextCursor: null })
        .success,
    ).toBe(false);
  }
});

const membership = {
  merchantId,
  restaurantName: application.restaurantName,
  status: "pending_review",
  role: "owner",
};

test("[MER-02:contract] lists each merchant's lifecycle status and its own membership role", () => {
  const statusesAndRoles = [
    ["pending_review", "owner"],
    ["approved", "manager"],
    ["rejected", "staff"],
    ["active", "owner"],
    ["paused", "manager"],
    ["suspended", "staff"],
  ];
  const memberships = statusesAndRoles.map(([status, role], index) => ({
    ...membership,
    merchantId: fixtureId(20 + index),
    status,
    role,
  }));

  expect(merchantMembershipsOutput.parse({ sessionId: communeId, memberships })).toEqual({
    sessionId: communeId,
    memberships,
  });
  expect(merchantMembershipsOutput.parse({ sessionId: communeId, memberships: [] })).toEqual({
    sessionId: communeId,
    memberships: [],
  });
  expect(merchantMembershipsOutput.safeParse({ memberships: [] }).success).toBe(false);
});

test("[MER-02:contract] refuses invalid merchant states, global roles and membership internals", () => {
  for (const invalid of [
    { merchantId: "not-a-uuid" },
    { restaurantName: 7 },
    { status: "draft" },
    { role: "admin" },
    { role: "merchant_owner" },
    { userId: fixtureId(3) },
  ]) {
    expect(
      merchantMembershipsOutput.safeParse({
        sessionId: communeId,
        memberships: [{ ...membership, ...invalid }],
      }).success,
    ).toBe(false);
  }
});

test("[MER-01:contract] parses a bounded official-code commune page", () => {
  expect(communeListQuery.parse({})).toEqual({ limit: 50 });
  expect(communeListQuery.parse({ wilayaCode: "16", cursor: "1608", limit: "100" })).toEqual({
    wilayaCode: 16,
    cursor: "1608",
    limit: 100,
  });
  for (const query of [
    { wilayaCode: "0" },
    { wilayaCode: "70" },
    { limit: "101" },
    { limit: "1e1" },
    { limit: ["20", "50"] },
    { cursor: "not-a-code" },
    { admin: "true" },
  ])
    expect(communeListQuery.safeParse(query).success).toBe(false);
});
