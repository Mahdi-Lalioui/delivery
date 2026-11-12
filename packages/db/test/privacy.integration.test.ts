import { createHash, randomUUID } from "node:crypto";
import { runMigrations } from "graphile-worker";
import { expect, test } from "vitest";
import { createAuthRepository } from "../src/auth.ts";
import { createOrderRepository } from "../src/orders.ts";
import { createPrivacyRepository } from "../src/privacy.ts";
import { registerTestDatabase } from "./database.ts";
import { seedReadyPhoto } from "./ready-photo.ts";

const database = registerTestDatabase();
const now = new Date("2026-11-09T12:00:00.000Z");
let phoneSuffix = 0;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function at(seconds: number): Date {
  return new Date(now.getTime() + seconds * 1_000);
}

async function customer() {
  const auth = createAuthRepository(database.get());
  const phoneE164 = `+2135${String(++phoneSuffix).padStart(8, "0")}`;
  const { id: userId } = await auth.transaction((tx) =>
    tx.getOrCreateUserForSignIn({ phoneE164, now }),
  );
  return { userId, phoneE164, ...(await addSession({ userId, transport: "web" })) };
}

async function addSession({ userId, transport }: { userId: string; transport: "web" | "bearer" }) {
  const auth = createAuthRepository(database.get());
  const sessionId = randomUUID();
  const tokenHash = digest(sessionId);
  await auth.transaction((tx) =>
    tx.insertSession({
      id: sessionId,
      userId,
      tokenHash,
      transport,
      kind: "standard",
      requestIp: "192.0.2.1",
      deviceName: "Private device",
      now,
    }),
  );
  return { sessionId, tokenHash, transport };
}

function challenge(
  scope: { userId: string; sessionId: string },
  requestIp: string,
  key = randomUUID(),
) {
  const challengeId = randomUUID();
  return {
    userId: scope.userId,
    sessionId: scope.sessionId,
    challengeId,
    codeHmac: digest(`${challengeId}:correct`),
    keyHash: digest(key),
    requestIp,
    hashRequestIp: digest,
    now,
  };
}

async function issueDelivered(input: ReturnType<typeof challenge>) {
  const repo = createPrivacyRepository(database.get());
  expect(await repo.issueDeletionChallenge(input)).toMatchObject({ kind: "issued" });
  expect(await repo.deliverDeletionChallenge({ ...input, send() {} })).toBe(true);
}

test("[CUS-24] scopes issue receipts to the account and active challenge lifetime", async () => {
  const repo = createPrivacyRepository(database.get());
  const [first, other] = await Promise.all([customer(), customer()]);
  const key = randomUUID();
  const request = challenge(first, "192.0.2.10", key);
  const retry = challenge(first, "192.0.2.11", key);
  const [issued, repeated] = await Promise.all([
    repo.issueDeletionChallenge(request),
    repo.issueDeletionChallenge(retry),
  ]);
  expect(issued).toMatchObject({ kind: "issued", phoneE164: first.phoneE164, expiresAt: at(300) });
  expect(repeated).toEqual(issued);
  const independent = challenge(other, "192.0.2.10", key);
  expect(await repo.issueDeletionChallenge(independent)).toMatchObject({
    kind: "issued",
    challengeId: independent.challengeId,
    phoneE164: other.phoneE164,
  });
  const afterExpiry = challenge(first, "192.0.2.10", key);
  expect(await repo.issueDeletionChallenge({ ...afterExpiry, now: at(300) })).toMatchObject({
    kind: "issued",
    challengeId: afterExpiry.challengeId,
    expiresAt: at(600),
  });
});

test("[CUS-24] enforces the resend cooldown and rolling account send quota", async () => {
  const repo = createPrivacyRepository(database.get());
  const account = await customer();
  const request = () => challenge(account, "192.0.2.20");
  expect(await repo.issueDeletionChallenge(request())).toMatchObject({ kind: "issued" });
  expect(await repo.issueDeletionChallenge({ ...request(), now: at(1) })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 44,
  });
  for (const second of [45, 90]) {
    expect(await repo.issueDeletionChallenge({ ...request(), now: at(second) })).toMatchObject({
      kind: "issued",
    });
  }
  expect(await repo.issueDeletionChallenge({ ...request(), now: at(135) })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 765,
  });
  expect(await repo.issueDeletionChallenge({ ...request(), now: at(900) })).toMatchObject({
    kind: "issued",
  });
});

test("[CUS-24] serializes the IP quota across accounts and IPv4-mapped addresses", async () => {
  const repo = createPrivacyRepository(database.get());
  const accounts = await Promise.all(Array.from({ length: 21 }, () => customer()));
  const results = await Promise.all(
    accounts.map((account, index) =>
      repo.issueDeletionChallenge(
        challenge(account, index % 2 ? "::ffff:192.0.2.30" : "192.0.2.30"),
      ),
    ),
  );
  expect(results.filter(({ kind }) => kind === "issued")).toHaveLength(20);
  expect(results.filter(({ kind }) => kind === "rate_limited")).toEqual([
    { kind: "rate_limited", retryAfterSeconds: 3_600 },
  ]);
});

test("[CUS-24] retries a failed send and delivers concurrent retries only once", async () => {
  const repo = createPrivacyRepository(database.get());
  const request = challenge(await customer(), "192.0.2.40");
  expect(await repo.issueDeletionChallenge(request)).toMatchObject({ kind: "issued" });
  const failed = repo.deliverDeletionChallenge({
    ...request,
    send() {
      throw new Error("provider unavailable");
    },
  });
  await expect(failed).rejects.toThrow("provider unavailable");
  const sends: string[] = [];
  const send = () => {
    sends.push("sent");
  };
  const receipts = await Promise.all([
    repo.deliverDeletionChallenge({ ...request, send }),
    repo.deliverDeletionChallenge({ ...request, send }),
  ]);
  expect(receipts).toEqual([true, true]);
  expect(sends).toEqual(["sent"]);
});

test("[CUS-24] rejects a different account and caps a challenge at five concurrent wrong codes", async () => {
  const repo = createPrivacyRepository(database.get());
  const [owner, other] = await Promise.all([customer(), customer()]);
  const request = challenge(owner, "192.0.2.50");
  await issueDelivered(request);
  await expect(repo.deleteAccount({ ...request, ...other })).resolves.toBe("challenge_expired");
  const wrong = { ...request, codeHmac: digest("wrong") };
  const results = await Promise.all(Array.from({ length: 8 }, () => repo.deleteAccount(wrong)));
  expect(results.filter((result) => result === "invalid_code")).toHaveLength(4);
  expect(results.filter((result) => result === "challenge_expired")).toHaveLength(4);
  await expect(repo.deleteAccount(request)).resolves.toBe("challenge_expired");
  await expect(repo.exportAccount({ ...owner, now })).resolves.toMatchObject({
    profile: { accountId: owner.userId, phoneE164: owner.phoneE164 },
  });
});

test("[CUS-24] does not redeem a correct but expired or undelivered challenge", async () => {
  const repo = createPrivacyRepository(database.get());
  const request = challenge(await customer(), "192.0.2.60");
  await expect(repo.issueDeletionChallenge(request)).resolves.toMatchObject({ kind: "issued" });
  await expect(repo.deleteAccount(request)).resolves.toBe("challenge_expired");
  await expect(repo.deliverDeletionChallenge({ ...request, send() {} })).resolves.toBe(true);
  await expect(repo.deleteAccount({ ...request, now: at(300) })).resolves.toBe("challenge_expired");
});

async function seedPrivateAddress(userId: string, label: string) {
  const addressId = randomUUID();
  await database.get().sql`
    INSERT INTO public.addresses (id, user_id, label, location, plus_code, is_default, floor)
    VALUES (${addressId}, ${userId}, ${label},
      ST_GeogFromText('SRID=4326;POINT(3.0625 36.75)'), '8F85Q327+22', true, '2')
  `;
  return addressId;
}

test("[CUS-24] deletes once, revokes all sessions, and permits only the original bounded proof", async () => {
  const repo = createPrivacyRepository(database.get());
  const { sql } = database.get();
  const account = await customer();
  const addressId = await seedPrivateAddress(account.userId, "Maison");
  await sql`
    INSERT INTO public.push_subscriptions (endpoint, user_id, session_id, p256dh, auth_key)
    VALUES ('https://fcm.googleapis.com/fcm/send/fixture', ${account.userId}, ${account.sessionId},
      'B' || repeat('A', 86), repeat('A', 22))
  `;
  const secondSession = await addSession({ userId: account.userId, transport: "bearer" });
  const request = challenge(account, "192.0.2.70");
  const auth = createAuthRepository(database.get());
  const signInId = randomUUID();
  await auth.transaction((tx) =>
    tx.reserveOtpChallenge({
      id: signInId,
      phoneE164: account.phoneE164,
      requestIp: "192.0.2.70",
      purpose: "sign_in",
      codeHmac: digest(signInId),
      idempotencyKeyHash: digest(signInId),
      now,
    }),
  );
  await issueDelivered(request);
  const confirmation = { ...request, now: at(299) };
  expect(
    await Promise.all([repo.deleteAccount(confirmation), repo.deleteAccount(confirmation)]),
  ).toEqual(["deleted", "deleted"]);
  expect(await repo.replayDeletion({ ...account, ...confirmation })).toBe(true);
  expect(await repo.replayDeletion({ ...confirmation, ...secondSession })).toBe(false);
  expect(await repo.replayDeletion({ ...account, ...confirmation, transport: "bearer" })).toBe(
    false,
  );
  expect(
    await repo.replayDeletion({ ...account, ...confirmation, codeHmac: digest("wrong") }),
  ).toBe(false);
  await repo.pruneDeletionState(at(300));
  expect(await repo.replayDeletion({ ...account, ...confirmation, now: at(300) })).toBe(true);
  expect(await repo.replayDeletion({ ...account, ...confirmation, now: at(598) })).toBe(true);
  expect(await repo.replayDeletion({ ...account, ...confirmation, now: at(599) })).toBe(false);
  expect(await repo.exportAccount({ ...account, now })).toBeUndefined();
  expect(await sql`SELECT FROM public.addresses WHERE id = ${addressId}`).toHaveLength(0);
  expect(
    await sql`SELECT FROM public.push_subscriptions WHERE user_id = ${account.userId}`,
  ).toHaveLength(0);
  expect(await auth.resolveSession({ ...account, now })).toBeUndefined();
  expect(await auth.resolveSession({ ...secondSession, now })).toBeUndefined();
  const [user] =
    await sql`SELECT phone_e164, deleted_at IS NOT NULL AS deleted FROM users WHERE id = ${account.userId}`;
  expect(user).toEqual({ phone_e164: null, deleted: true });
  expect(
    await sql`
    SELECT count(*)::int AS count FROM sessions
    WHERE user_id = ${account.userId} AND revoked_at IS NOT NULL
      AND device_name IS NULL AND request_ip IS NULL
  `,
  ).toEqual([{ count: 2 }]);
  expect(await sql`SELECT id FROM otp_challenges WHERE id = ${signInId}`).toHaveLength(0);
  expect(
    await sql`SELECT count(*)::int AS count FROM account_deletion_audit WHERE user_id = ${account.userId}`,
  ).toEqual([{ count: 1 }]);
  const newOwner = await auth.transaction((tx) =>
    tx.getOrCreateUserForSignIn({ phoneE164: account.phoneE164, now: at(300) }),
  );
  expect(newOwner.id).not.toBe(account.userId);
});

test("[CUS-24] exports only the active session's own profile and supported collections", async () => {
  const repo = createPrivacyRepository(database.get());
  const [account, other] = await Promise.all([customer(), customer()]);
  expect(
    await repo.exportAccount({ userId: account.userId, sessionId: other.sessionId, now }),
  ).toBeUndefined();
  const addressId = await seedPrivateAddress(account.userId, "Maison");
  await seedPrivateAddress(other.userId, "Adresse privée");
  expect(await repo.exportAccount({ ...account, now })).toEqual({
    profile: { accountId: account.userId, phoneE164: account.phoneE164 },
    addresses: [
      {
        addressId,
        label: "Maison",
        communeId: null,
        floor: "2",
        isDefault: true,
        plusCode: "8F85Q327+22",
        pin: { latitude: 36.75, longitude: 3.0625 },
        landmark: null,
        instructions: null,
      },
    ],
    orders: [],
    ratings: [],
  });
});

test("[CUS-24] rechecks privilege acquired after OTP issuance, even for a standard session", async () => {
  const repo = createPrivacyRepository(database.get());
  const { sql } = database.get();
  const account = await customer();
  const request = challenge(account, "192.0.2.80");
  await issueDelivered(request);
  await sql`
    INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${account.userId}, decode('01', 'hex'))
  `;
  await expect(repo.deleteAccount(request)).resolves.toBe("unauthorized");
  await expect(repo.issueDeletionChallenge(request)).resolves.toEqual({ kind: "unauthorized" });
  await expect(
    repo.deliverDeletionChallenge({
      ...request,
      send() {
        throw new Error("Should not send for privileged accounts");
      },
    }),
  ).resolves.toBe(false);
  await expect(repo.exportAccount({ ...account, now })).resolves.toMatchObject({
    profile: { accountId: account.userId },
  });
});

async function merchantFixture() {
  const { sql } = database.get();
  const owner = await customer();
  const communeId = randomUUID();
  const merchantId = randomUUID();
  const timestamp = now.toISOString();
  await sql`
    INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'ولاية', 'Wilaya') ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, ${String(1600 + phoneSuffix)}, 16, 'بلدية', 'Commune',
      st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography)
  `;
  await sql`
    INSERT INTO merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines, status, created_at)
    VALUES (${merchantId}, ${merchantId}, 'Test restaurant', 'Test owner', ${owner.phoneE164},
      ${communeId}, st_setsrid(st_makepoint(3.05, 36.765), 4326)::geography,
      ARRAY['algerian'], 'approved', ${timestamp})
  `;
  await sql`
    INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${owner.userId}, 'owner')
  `;
  return { merchantId, owner };
}

test("[CUS-24] preserves merchant and monetary records and scrubs the customer's links", async () => {
  const repo = createPrivacyRepository(database.get());
  const { sql } = database.get();
  const { merchantId, owner } = await merchantFixture();
  const account = await customer();
  const request = challenge(account, "192.0.2.90");
  const [promotion] = await sql<{ id: string }[]>`
    INSERT INTO promotions (merchant_id, discount, conditions, created_at, updated_at)
    VALUES (${merchantId}, '{"kind": "fixed"}', '{}', ${now.toISOString()}, ${now.toISOString()})
    RETURNING id
  `;
  if (!promotion) throw new Error("Expected a promotion fixture.");
  const orderId = randomUUID();
  await sql`
    INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id, sales_dzd)
    VALUES (${promotion.id}, ${orderId}, ${account.userId}, 2500)
  `;
  const invitationId = randomUUID();
  await sql`
    INSERT INTO merchant_staff_invitations
      (id, merchant_id, phone_e164, role, token_hash, invited_by, key_hash, request_hash, created_at, expires_at)
    VALUES (${invitationId}, ${merchantId}, ${account.phoneE164}, 'staff', ${digest(invitationId)}, ${owner.userId},
      ${digest("invite")}, ${digest("request")}, ${now.toISOString()}, ${at(600).toISOString()})
  `;

  await expect(repo.issueDeletionChallenge(challenge(owner, "192.0.2.90"))).resolves.toEqual({
    kind: "unauthorized",
  });
  await issueDelivered(request);
  await expect(repo.deleteAccount(request)).resolves.toBe("deleted");
  expect(
    await sql`SELECT customer_id, sales_dzd FROM promotion_redemptions WHERE order_id = ${orderId}`,
  ).toEqual([{ customer_id: null, sales_dzd: 2500 }]);
  expect(
    await sql`SELECT id FROM merchant_staff_invitations WHERE id = ${invitationId}`,
  ).toHaveLength(0);
  expect(await sql`SELECT phone_e164 FROM merchants WHERE id = ${merchantId}`).toEqual([
    { phone_e164: owner.phoneE164 },
  ]);
});

test("[CUS-24] rolls back deletion effects when the audit write fails", async () => {
  const repo = createPrivacyRepository(database.get());
  const { sql } = database.get();
  const account = await customer();
  const request = challenge(account, "192.0.2.100");
  await issueDelivered(request);
  await sql`INSERT INTO account_deletion_audit (user_id, created_at) VALUES (${account.userId}, ${now.toISOString()})`;
  await expect(repo.deleteAccount(request)).rejects.toMatchObject({ code: "23505" });
  await expect(repo.exportAccount({ ...account, now })).resolves.toMatchObject({
    profile: { accountId: account.userId, phoneE164: account.phoneE164 },
  });
  await expect(repo.replayDeletion({ ...account, ...request })).resolves.toBe(false);
  await sql`DELETE FROM account_deletion_audit WHERE user_id = ${account.userId}`;
  await expect(repo.deleteAccount(request)).resolves.toBe("deleted");
});

test("[CUS-24] prunes expired proof and challenge secrets during later issue traffic", async () => {
  const repo = createPrivacyRepository(database.get());
  const { sql } = database.get();
  const [account, other] = await Promise.all([customer(), customer()]);
  const request = challenge(account, "192.0.2.110");
  await issueDelivered(request);
  await expect(repo.deleteAccount(request)).resolves.toBe("deleted");
  const pending = challenge(other, "192.0.2.111");
  await expect(repo.issueDeletionChallenge(pending)).resolves.toMatchObject({ kind: "issued" });
  await expect(
    repo.issueDeletionChallenge({ ...challenge(other, "192.0.2.111"), now: at(300) }),
  ).resolves.toMatchObject({ kind: "issued" });
  expect(
    await sql`SELECT challenge_id FROM account_deletion_proofs WHERE challenge_id = ${request.challengeId}`,
  ).toHaveLength(0);
  expect(
    await sql`SELECT key_hash, code_hmac FROM account_deletion_challenges WHERE id = ${pending.challengeId}`,
  ).toEqual([{ key_hash: null, code_hmac: null }]);

  await expect(
    repo.issueDeletionChallenge({ ...challenge(other, "192.0.2.111"), now: at(86_400) }),
  ).resolves.toMatchObject({ kind: "issued" });
  expect(
    await sql`SELECT id FROM account_deletion_challenges WHERE id = ${request.challengeId}`,
  ).toHaveLength(0);
  expect(
    await sql`SELECT user_id FROM account_deletion_audit WHERE user_id = ${account.userId}`,
  ).toEqual([{ user_id: account.userId }]);
});

test("[CUS-24] preserves sign-in phone and IP throttles after removing old OTPs", async () => {
  const auth = createAuthRepository(database.get());
  const repo = createPrivacyRepository(database.get());
  const { sql } = database.get();
  const account = await customer();
  const requestIp = "192.0.2.120";
  const signIn = (phoneE164: string, ip: string, requestedAt: Date) => {
    const id = randomUUID();
    return auth.transaction((tx) =>
      tx.reserveOtpChallenge({
        id,
        phoneE164,
        requestIp: ip,
        purpose: "sign_in",
        codeHmac: digest(id),
        idempotencyKeyHash: digest(id),
        now: requestedAt,
      }),
    );
  };
  await expect(signIn(account.phoneE164, requestIp, now)).resolves.toMatchObject({
    kind: "created",
  });
  await sql`
    INSERT INTO otp_challenges
      (id, phone_e164, request_ip, purpose, code_hmac, idempotency_key_hash, requested_at, expires_at)
    SELECT uuidv7(), '+2136' || lpad(number::text, 8, '0'), ${requestIp}::inet, 'sign_in',
      ${digest("otp")}, ${digest("key")}, ${now.toISOString()}, ${at(300).toISOString()}
    FROM generate_series(1, 19) AS numbers(number)
  `;
  const request = challenge(account, requestIp);
  await issueDelivered(request);
  await expect(repo.deleteAccount(request)).resolves.toBe("deleted");
  await expect(signIn(account.phoneE164, "192.0.2.121", at(1))).resolves.toEqual({
    kind: "rate_limited",
    retryAt: at(45),
  });
  await expect(signIn("+213700000999", requestIp, at(1))).resolves.toEqual({
    kind: "rate_limited",
    retryAt: at(3600),
  });
  await expect(signIn("+213700000999", requestIp, at(3600))).resolves.toMatchObject({
    kind: "created",
  });
});

test("[CUS-24] queues erasure of unattached media and retains attached application records", async () => {
  const repo = createPrivacyRepository(database.get());
  const { sql } = database.get();
  await runMigrations({ connectionString: database.url(), schema: "graphile_worker" });
  const [account, { merchantId }] = await Promise.all([customer(), merchantFixture()]);
  const orphan = randomUUID();
  const attached = randomUUID();
  for (const mediaId of [orphan, attached]) {
    await seedReadyPhoto(sql, { mediaId, accountId: account.userId, kind: "application", now });
  }
  await sql`
    INSERT INTO merchant_application_photos (merchant_id, media_id, sort)
    VALUES (${merchantId}, ${attached}, 0)
  `;

  const partialVariant = `variants/${orphan}/partial.webp`;
  await repo.recordApplicationMediaArtifact(orphan, `variants/${orphan}/160.avif`);
  await repo.recordApplicationMediaArtifact(orphan, partialVariant);
  await repo.recordApplicationMediaArtifact(orphan, partialVariant);
  const request = challenge(account, "192.0.2.130");
  await issueDelivered(request);
  await expect(repo.deleteAccount(request)).resolves.toBe("deleted");
  expect(
    await sql`
    SELECT job.task_identifier, job.queue_name, stored.payload
    FROM graphile_worker.jobs AS job
    JOIN graphile_worker._private_jobs AS stored USING (id)
    WHERE job.task_identifier = 'privacy.purge_media'
  `,
  ).toEqual([
    {
      task_identifier: "privacy.purge_media",
      queue_name: "media",
      payload: { userId: account.userId },
    },
  ]);
  const media = await repo.findErasureMedia(account.userId);
  expect(media.map(({ mediaId }) => mediaId)).toEqual([orphan]);
  expect(media[0]?.keys).toContain(`quarantine/${orphan}`);
  expect(media[0]?.keys).toContain(`previews/${orphan}`);
  expect(media[0]?.keys).toContain(`variants/${orphan}/160.avif`);
  expect(media[0]?.keys).toContain(partialVariant);
  expect(media[0]?.keys).toHaveLength(13);
  await repo.finishErasureMedia({ userId: account.userId, mediaId: attached });
  await repo.finishErasureMedia({ userId: account.userId, mediaId: orphan });
  expect(await repo.findErasureMedia(account.userId)).toEqual([]);
  expect(await sql`SELECT id FROM media_uploads WHERE id = ${attached}`).toEqual([
    { id: attached },
  ]);
});

test("[CUS-24] exports only owned orders and erases order PII without losing accounting", async () => {
  const repo = createPrivacyRepository(database.get());
  const { sql } = database.get();
  const [account, other, { merchantId }] = await Promise.all([
    customer(),
    customer(),
    merchantFixture(),
  ]);
  const orderId = randomUUID();
  const anotherId = randomUUID();
  const lines = JSON.stringify([
    {
      itemId: randomUUID(),
      names: { fr: "Couscous" },
      unitPriceDzd: 500,
      quantity: 2,
      options: [],
      note: "Contact privé",
    },
  ]);
  await sql`
    INSERT INTO public.orders (
      id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day, status,
      fulfilment, version, placed_at, last_event_at, address_snapshot, subtotal_dzd,
      delivery_fee_dzd, total_dzd, paying_with_dzd, lines
    )
    VALUES
      (${orderId}, ${randomUUID()}, ${account.userId}, ${merchantId}, 'Test', 'AAA-222', current_date,
       'delivered', 'delivery', 1, now(), now(), '{"landmark":"Lieu privé"}', 1000, 137, 1137, 1200, ${lines}::jsonb),
      (${anotherId}, ${randomUUID()}, ${other.userId}, ${merchantId}, 'Test', 'AAA-223', current_date,
       'delivered', 'delivery', 1, now(), now(), NULL, 1000, 137, 1137, 1200, ${lines}::jsonb)
  `;
  await sql`
    INSERT INTO public.order_events (order_id, version, to_status, actor_kind, actor_id, payload, occurred_at)
    VALUES (${orderId}, 1, 'delivered', 'customer', ${account.userId}, '{"kind":"place"}', now())
  `;
  expect((await repo.exportAccount({ ...account, now }))?.orders).toMatchObject([
    { orderId, totalDzd: 1137, lines: [{ lineTotalDzd: 1000 }] },
  ]);
  const rating = await createOrderRepository(database.get()).rate({
    customerId: account.userId,
    sessionId: account.sessionId,
    orderId,
    input: { foodStars: 5, deliveryStars: 4, comment: "Contact privé" },
    now,
    idempotencyKey: "first-rating",
  });
  expect(rating.kind).toBe("rated");
  expect((await repo.exportAccount({ ...account, now }))?.ratings).toHaveLength(1);
  const request = challenge(account, "192.0.2.190");
  await issueDelivered(request);
  expect(await repo.deleteAccount(request)).toBe("deleted");
  expect(
    await sql`
    SELECT customer_id, address_snapshot, lines->0->>'note' AS note, total_dzd
    FROM public.orders WHERE id = ${orderId}`,
  ).toEqual([{ customer_id: null, address_snapshot: null, note: null, total_dzd: 1137 }]);
  expect(
    await sql`SELECT comment, food_stars FROM public.ratings WHERE order_id = ${orderId}`,
  ).toEqual([{ comment: null, food_stars: 5 }]);
  expect(await sql`SELECT 1 FROM public.order_rating_receipts WHERE order_id = ${orderId}`).toEqual(
    [],
  );
  expect(await sql`SELECT actor_id FROM public.order_events WHERE order_id = ${orderId}`).toEqual([
    { actor_id: null },
  ]);
});

test("[CUS-24] exports both verified identifiers and erases an email-only account", async () => {
  const repo = createPrivacyRepository(database.get());
  const auth = createAuthRepository(database.get());
  const { sql } = database.get();
  const linked = await customer();
  const linkedEmail = "linked-privacy@example.test";
  await sql`UPDATE public.users SET email = ${linkedEmail} WHERE id = ${linked.userId}`;
  expect((await repo.exportAccount({ ...linked, now }))?.profile).toEqual({
    accountId: linked.userId,
    phoneE164: linked.phoneE164,
    email: linkedEmail,
  });
  const linkedChallenge = challenge(linked, "192.0.2.184");
  expect(await repo.issueDeletionChallenge(linkedChallenge)).toMatchObject({ kind: "issued" });
  let linkedTarget: unknown;
  expect(
    await repo.deliverDeletionChallenge({
      ...linkedChallenge,
      preferEmail: true,
      send(target) {
        linkedTarget = target;
      },
    }),
  ).toBe(true);
  expect(linkedTarget).toEqual({ email: linkedEmail });
  const email = "email-only-privacy@example.test";
  const { id: userId } = await auth.transaction((tx) =>
    tx.getOrCreateUserForSignIn({ email, now }),
  );
  const account = { userId, ...(await addSession({ userId, transport: "web" })) };
  expect((await repo.exportAccount({ ...account, now }))?.profile).toEqual({
    accountId: userId,
    phoneE164: null,
    email,
  });
  const input = challenge(account, "192.0.2.185");
  expect(await repo.issueDeletionChallenge(input)).toMatchObject({ kind: "issued" });
  let destination: unknown;
  expect(
    await repo.deliverDeletionChallenge({
      ...input,
      send(target) {
        destination = target;
      },
    }),
  ).toBe(true);
  expect(destination).toEqual({ email });
  expect(await repo.deleteAccount(input)).toBe("deleted");
  expect(await repo.exportAccount({ ...account, now })).toBeUndefined();
  const [deleted] =
    await sql`SELECT phone_e164, email, deleted_at FROM public.users WHERE id = ${userId}`;
  expect(deleted).toMatchObject({ phone_e164: null, email: null });
  expect(deleted?.deleted_at).toBeTruthy();
  expect(
    await repo.replayDeletion({ ...input, tokenHash: account.tokenHash, transport: "web" }),
  ).toBe(true);
});
