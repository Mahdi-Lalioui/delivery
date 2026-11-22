import { randomUUIDv7 } from "node:crypto";
import {
  adminMerchantNoticeOutput,
  adminMerchantReviewOutput,
  adminReviewQueueOutput,
} from "@zaafran/contracts/admin";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuCategoryOrderOutput,
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
} from "@zaafran/contracts/menu";
import {
  communeListOutput,
  merchantApplicationOutput,
  merchantMembershipsOutput,
  merchantOnboardingOutput,
} from "@zaafran/contracts/merchant";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-07T12:00:00.000Z";
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[MER-01:http] [ADM-03:http] submits, scopes and reviews a merchant on the composed API", async () => {
  const api = await openApi();
  const applicantPhone = "+213500000030";
  const applicant = await seedActor(applicantPhone, "standard");
  const other = await seedActor("+213500000031", "standard");
  const admin = await seedActor("+213500000032", "admin");
  const otherAdmin = await seedActor("+213500000033", "admin");
  const communeId = randomUUIDv7();
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'الجزائر', 'Alger')`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid, boundary)
    VALUES (${communeId}, '1601', 16, 'بلدية الاختبار', 'Commune fictive',
      ST_SetSRID(ST_MakePoint(3, 36.75), 4326)::geography,
      ST_Multi(ST_MakeEnvelope(2.99, 36.74, 3.01, 36.76, 4326)))
  `;

  const communes = await api.inject("/v1/communes?wilayaCode=16&limit=1");
  expect(communes.statusCode).toBe(200);
  expect(communeListOutput.parse(communes.json()).communes).toEqual([
    {
      id: communeId,
      code: "1601",
      wilayaCode: 16,
      nameAr: "بلدية الاختبار",
      nameFr: "Commune fictive",
    },
  ]);

  const applicationsPath = "/v1/merchant-applications";
  const queuePath = "/v1/admin/merchant-applications";
  const membershipsPath = "/v1/me/merchants";
  const noticePath = queuePath + "/notice";
  const readNotice = async () => {
    const response = await api.inject({ url: noticePath, headers: admin.headers });
    expect(response.statusCode).toBe(200);
    return adminMerchantNoticeOutput.parse(response.json());
  };
  const emptyNotice = { sessionId: admin.sessionId, pendingCount: 0, latestMerchantId: null };
  expect(await readNotice()).toEqual(emptyNotice);
  const application = {
    restaurantName: "Cuisine fictive",
    ownerName: "Propriétaire fictif",
    communeId,
    pin: { longitude: 3, latitude: 36.75 },
    cuisines: ["algerian"],
    rcNumber: "22B1234567",
  };
  const signupKey = randomUUIDv7();
  const submit = (payload = application, key = signupKey) =>
    api.inject({
      method: "POST",
      url: applicationsPath,
      headers: {
        ...applicant.headers,
        "idempotency-key": key,
        "x-expected-session-id": applicant.sessionId,
      },
      payload,
    });

  const outside = await submit(
    { ...application, pin: { longitude: 3.02, latitude: 36.75 } },
    randomUUIDv7(),
  );
  expect(problemResponseSchema.parse(outside.json())).toMatchObject({
    status: 422,
    code: "outside_commune",
  });
  const staleApplication = await api.inject({
    method: "POST",
    url: applicationsPath,
    headers: {
      ...other.headers,
      "idempotency-key": signupKey,
      "x-expected-session-id": applicant.sessionId,
    },
    payload: application,
  });
  expect(problemResponseSchema.parse(staleApplication.json())).toMatchObject({
    status: 409,
    code: "session_changed",
  });
  const created = await submit();
  expect(created.statusCode).toBe(201);
  const result = merchantApplicationOutput.parse(created.json());
  const onboardingPath = "/v1/merchants/" + result.merchantId + "/onboarding";
  expect((await api.inject({ url: onboardingPath, headers: applicant.headers })).statusCode).toBe(
    404,
  );
  expect((await submit()).json()).toEqual(result);
  expect(await readNotice()).toEqual({
    sessionId: admin.sessionId,
    pendingCount: 1,
    latestMerchantId: result.merchantId,
  });
  const revokedAdmin = await seedActor("+213500000039", "admin");
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  for (const [headers, statusCode] of [
    [{}, 401],
    [applicant.headers, 403],
    [revokedAdmin.headers, 401],
  ] as const) {
    const denied = await api.inject({ url: noticePath, headers });
    expect(denied.statusCode).toBe(statusCode);
    expect(denied.body).not.toContain(result.merchantId);
  }
  const collision = await submit({ ...application, restaurantName: "Autre cuisine fictive" });
  expect(problemResponseSchema.parse(collision.json())).toMatchObject({
    status: 409,
    code: "idempotency_conflict",
  });

  const current = await api.inject({ url: membershipsPath, headers: applicant.headers });
  expect(merchantMembershipsOutput.parse(current.json()).sessionId).toBe(applicant.sessionId);
  expect(merchantMembershipsOutput.parse(current.json()).memberships).toEqual([
    { ...result, restaurantName: application.restaurantName, role: "owner" },
  ]);
  const isolated = await api.inject({ url: membershipsPath, headers: other.headers });
  expect(merchantMembershipsOutput.parse(isolated.json()).memberships).toEqual([]);
  expect((await api.inject({ url: queuePath, headers: applicant.headers })).statusCode).toBe(403);

  const queued = await api.inject({ url: queuePath, headers: admin.headers });
  expect(queued.statusCode).toBe(200);
  expect(queued.headers["cache-control"]).toBe("no-store");
  expect(adminReviewQueueOutput.parse(queued.json()).sessionId).toBe(admin.sessionId);
  expect(adminReviewQueueOutput.parse(queued.json()).applications).toEqual([
    {
      merchantId: result.merchantId,
      restaurantName: application.restaurantName,
      ownerName: application.ownerName,
      phoneE164: applicantPhone,
      commune: { id: communeId, nameAr: "بلدية الاختبار", nameFr: "Commune fictive" },
      pin: application.pin,
      cuisines: application.cuisines,
      rcNumber: application.rcNumber,
      submittedAt: now,
    },
  ]);

  const reviewKey = randomUUIDv7();
  const review = (headers: typeof admin.headers) =>
    api.inject({
      method: "POST",
      url: queuePath + "/" + result.merchantId + "/review",
      headers: {
        ...headers,
        "idempotency-key": reviewKey,
        "x-expected-session-id": admin.sessionId,
      },
      payload: { decision: "approve", reason: "Verified synthetic application" },
    });
  const beforeApplication = await sql`SELECT to_jsonb(merchant) AS data
    FROM public.merchants AS merchant WHERE id = ${result.merchantId}`;
  const beforeReceipts = await sql`SELECT to_jsonb(receipt) AS data
    FROM public.merchant_command_receipts AS receipt WHERE merchant_id = ${result.merchantId}
    ORDER BY operation, actor_id, key_hash`;
  const beforeAudit =
    await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`;
  expect(beforeApplication).toHaveLength(1);
  expect(beforeReceipts).toHaveLength(1);
  expect((await review(other.headers)).statusCode).toBe(403);
  const staleReview = await review(otherAdmin.headers);
  expect(problemResponseSchema.parse(staleReview.json())).toMatchObject({
    status: 409,
    code: "session_changed",
  });
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${otherAdmin.sessionId}`;
  for (const actor of [
    { label: "guest", headers: {}, sessionId: admin.sessionId, expected: 401 },
    { label: "standard", headers: other.headers, sessionId: other.sessionId, expected: 403 },
    {
      label: "revoked",
      headers: otherAdmin.headers,
      sessionId: otherAdmin.sessionId,
      expected: 401,
    },
  ]) {
    const deniedQueue = await api.inject({ url: queuePath, headers: actor.headers });
    const deniedReview = await api.inject({
      method: "POST",
      url: queuePath + "/" + result.merchantId + "/review",
      headers: {
        ...actor.headers,
        "idempotency-key": randomUUIDv7(),
        "x-expected-session-id": actor.sessionId,
      },
      payload: { decision: "approve", reason: "Verified synthetic application" },
    });
    for (const response of [deniedQueue, deniedReview]) {
      expect(response.statusCode, actor.label).toBe(actor.expected);
      expect(problemResponseSchema.parse(response.json())).toMatchObject({
        code: actor.expected === 401 ? "unauthenticated" : "forbidden",
      });
      for (const privateValue of [
        result.merchantId,
        applicantPhone,
        application.restaurantName,
        application.ownerName,
      ]) {
        expect(response.body).not.toContain(privateValue);
      }
    }
    expect(
      await sql`SELECT to_jsonb(merchant) AS data
      FROM public.merchants AS merchant WHERE id = ${result.merchantId}`,
    ).toEqual(beforeApplication);
    expect(
      await sql`SELECT to_jsonb(receipt) AS data
      FROM public.merchant_command_receipts AS receipt WHERE merchant_id = ${result.merchantId}
      ORDER BY operation, actor_id, key_hash`,
    ).toEqual(beforeReceipts);
    expect(
      await sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`,
    ).toEqual(beforeAudit);
  }
  const approved = await review(admin.headers);
  expect(approved.statusCode).toBe(200);
  expect(adminMerchantReviewOutput.parse(approved.json())).toEqual({
    merchantId: result.merchantId,
    status: "approved",
    reviewedAt: now,
  });
  expect((await review(admin.headers)).json()).toEqual(approved.json());

  const audits = await sql`
    SELECT actor_id, merchant_id, reason FROM audit_log WHERE merchant_id = ${result.merchantId}
  `;
  expect(Array.from(audits)).toEqual([
    {
      actor_id: admin.userId,
      merchant_id: result.merchantId,
      reason: "Verified synthetic application",
    },
  ]);
  const after = await api.inject({ url: membershipsPath, headers: applicant.headers });
  expect(merchantMembershipsOutput.parse(after.json()).memberships[0]?.status).toBe("approved");
  const checklist = await api.inject({ url: onboardingPath, headers: applicant.headers });
  expect(checklist.statusCode).toBe(200);
  expect(merchantOnboardingOutput.parse(checklist.json())).toEqual({
    sessionId: applicant.sessionId,
    merchantId: result.merchantId,
    restaurantName: application.restaurantName,
    steps: {
      profile: "complete",
      hours: "incomplete",
      menu: { itemsTowardMinimum: 0, requiredItems: 5 },
      deliveryZone: "unavailable",
      testOrder: "unavailable",
    },
    canGoLive: false,
  });
  expect((await api.inject({ url: onboardingPath, headers: other.headers })).statusCode).toBe(404);

  const completed = await api.inject({ url: queuePath, headers: admin.headers });
  expect(adminReviewQueueOutput.parse(completed.json()).applications).toEqual([]);
  expect(await readNotice()).toEqual(emptyNotice);

  const secondApplication = await api.inject({
    method: "POST",
    url: applicationsPath,
    headers: {
      ...other.headers,
      "idempotency-key": signupKey,
      "x-expected-session-id": other.sessionId,
    },
    payload: { ...application, restaurantName: "Seconde cuisine fictive", rcNumber: "22B1234568" },
  });
  expect(secondApplication.statusCode).toBe(201);
  const secondMerchant = merchantApplicationOutput.parse(secondApplication.json()).merchantId;
  expect(secondMerchant).not.toBe(result.merchantId);
  const secondMemberships = await api.inject({ url: membershipsPath, headers: other.headers });
  expect(merchantMembershipsOutput.parse(secondMemberships.json()).memberships).toMatchObject([
    { merchantId: secondMerchant },
  ]);
  const firstMemberships = await api.inject({ url: membershipsPath, headers: applicant.headers });
  expect(merchantMembershipsOutput.parse(firstMemberships.json()).memberships).toMatchObject([
    { merchantId: result.merchantId },
  ]);
});

test("[MER-09:http] [MER-23:http] manages ordered categories through the live merchant API", async () => {
  const api = await openApi();
  const actor = await seedActor("+213500000040", "standard");
  const { owned, staffed } = await seedMenuMerchants(actor.userId);
  const root = "/v1/merchants/";
  const suffix = "/menu/categories";
  const path = root + owned + suffix;
  const read = (url = path) => api.inject({ url, headers: actor.headers });
  const write = ({
    method,
    url = path,
    payload,
    key = randomUUIDv7(),
  }: {
    method: "POST" | "PUT";
    url?: string;
    payload: object;
    key?: string;
  }) =>
    api.inject({
      method,
      url,
      payload,
      headers: {
        ...actor.headers,
        "idempotency-key": key,
        "x-expected-session-id": actor.sessionId,
      },
    });

  expect(menuCategoryPageOutput.parse((await read()).json())).toEqual({
    sessionId: actor.sessionId,
    categories: [],
    context: { restaurantName: "Restaurant fictif" },
    revision: 0,
    nextCursor: null,
  });
  const firstCommand = {
    method: "POST",
    key: randomUUIDv7(),
    payload: { names: { fr: "Plats" }, availability: null, expectedRevision: 0 },
  } as const;
  expect((await write({ ...firstCommand, url: root + staffed + suffix })).statusCode).toBe(404);
  const created = await write(firstCommand);
  expect(created.statusCode).toBe(201);
  const first = menuCategoryWriteOutput.parse(created.json()).category;
  const secondResponse = await write({
    method: "POST",
    payload: {
      names: { ar: "حلويات" },
      availability: { from: "18:00", to: "02:00" },
      expectedRevision: 1,
    },
  });
  expect(secondResponse.statusCode).toBe(201);
  const second = menuCategoryWriteOutput.parse(secondResponse.json()).category;
  expect((await write(firstCommand)).json()).toEqual(created.json());

  const cursor = menuCategoryPageOutput.parse((await read(path + "?limit=1")).json()).nextCursor;
  if (!cursor) throw new Error("Expected another category page.");
  const reordered = await write({
    method: "PUT",
    url: path + "/order",
    payload: { categoryIds: [second.categoryId, first.categoryId], expectedRevision: 2 },
  });
  expect(menuCategoryOrderOutput.parse(reordered.json())).toEqual({
    categoryIds: [second.categoryId, first.categoryId],
    revision: 3,
  });
  const outdated = await read(path + "?cursor=" + encodeURIComponent(cursor));
  expect(problemResponseSchema.parse(outdated.json())).toMatchObject({
    status: 409,
    code: "revision_conflict",
  });

  const renamed = await write({
    method: "PUT",
    url: path + "/" + first.categoryId,
    payload: {
      ...firstCommand.payload,
      names: { ar: "الأطباق", fr: "Plats du jour" },
      expectedRevision: 3,
    },
  });
  expect(renamed.statusCode).toBe(200);
  expect(menuCategoryWriteOutput.parse(renamed.json())).toMatchObject({
    revision: 4,
    category: { categoryId: first.categoryId, position: 1 },
  });
  expect(menuCategoryPageOutput.parse((await read()).json())).toMatchObject({
    revision: 4,
    categories: [
      { ...second, position: 0 },
      { categoryId: first.categoryId, names: { ar: "الأطباق", fr: "Plats du jour" }, position: 1 },
    ],
  });
});
