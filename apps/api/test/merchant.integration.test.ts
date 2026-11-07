import { randomUUIDv7 } from "node:crypto";
import { adminMerchantReviewOutput, adminReviewQueueOutput } from "@zaafran/contracts/admin";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  communeListOutput,
  merchantApplicationOutput,
  merchantMembershipsOutput,
} from "@zaafran/contracts/merchant";
import { expect, onTestFinished, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { createSessionToken } from "../src/auth-crypto.ts";
import { startApi } from "../src/start.ts";

const database = registerTestDatabase();
const now = "2026-11-07T12:00:00.000Z";
const publicOrigin = "https://zaafran.test";

async function openApi() {
  const api = await startApi({
    environment: {
      DATABASE_URL: database.url(),
      AUTH_PUBLIC_ORIGIN: publicOrigin,
      AUTH_OTP_KEY: Buffer.alloc(32, 19).toString("hex"),
      AUTH_TOTP_KEY: Buffer.alloc(32, 26).toString("hex"),
    },
    now: () => new Date(now),
    async listen(app) {
      await app.ready();
      return "http://127.0.0.1:3002";
    },
  });
  onTestFinished(() => api.close());
  return api;
}

async function seedActor(phone: string, kind: "standard" | "admin") {
  const { sql } = database.get();
  const userId = randomUUIDv7();
  const sessionId = randomUUIDv7();
  const { token, tokenHash } = createSessionToken();
  await sql`INSERT INTO users (id, phone_e164, created_at) VALUES (${userId}, ${phone}, ${now})`;
  if (kind === "admin") {
    await sql`INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${userId}, ${Buffer.alloc(32, 41)})`;
  }
  await sql`
    INSERT INTO sessions
      (id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at)
    VALUES (${sessionId}, ${userId}, ${tokenHash}, 'web', ${kind}, '192.0.2.1',
      ${now}, ${now}, ${now}::timestamptz + interval '1 day')
  `;
  return {
    userId,
    sessionId,
    headers: {
      cookie: "__Host-session=" + token,
      origin: publicOrigin,
      "sec-fetch-site": "same-origin",
    },
  };
}

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
  expect((await submit()).json()).toEqual(result);
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
  expect((await review(other.headers)).statusCode).toBe(403);
  const staleReview = await review(otherAdmin.headers);
  expect(problemResponseSchema.parse(staleReview.json())).toMatchObject({
    status: 409,
    code: "session_changed",
  });
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
  const completed = await api.inject({ url: queuePath, headers: admin.headers });
  expect(adminReviewQueueOutput.parse(completed.json()).applications).toEqual([]);
});
