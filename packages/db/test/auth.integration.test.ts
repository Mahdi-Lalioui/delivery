import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { expect, test, vi } from "vitest";
import { createAuthRepository } from "../src/auth.ts";
import { openDatabase } from "../src/database.ts";
import { registerTestDatabase } from "./database.ts";

type Repository = ReturnType<typeof createAuthRepository>;
type Transaction = Parameters<Parameters<Repository["transaction"]>[0]>[0];
type OtpReservation = Parameters<Transaction["reserveOtpChallenge"]>[0];
type PhoneOtpReservation = Extract<OtpReservation, { phoneE164: string }>;
type SessionInsertion = Parameters<Transaction["insertSession"]>[0];

const database = registerTestDatabase();
const clock = Date.parse("2026-11-07T12:00:00.000Z");
const second = 1_000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;
const rawOtp = "001234";
const codeHmac = createHmac("sha256", "fixture-only-key").update(rawOtp).digest();

function instant(elapsed = 0): Date {
  return new Date(clock + elapsed);
}

function fixtureId(serial: number): string {
  return `01932f18-3150-7c33-8a7a-${serial.toString(16).padStart(12, "0")}`;
}

function fixturePhone(serial: number): string {
  return `+2135${String(serial).padStart(8, "0")}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function verificationAttempt(key: string, request: string) {
  return { keyHash: hash(key), requestHash: hash(request) };
}

const freshVerificationKeys = Array.from({ length: 8 }, (_, index) =>
  verificationAttempt(`fresh-key-${index.toString()}`, "fresh-fingerprint"),
);

function repository() {
  return createAuthRepository(database.get());
}

function reservation(
  serial: number,
  overrides: Partial<PhoneOtpReservation> = {},
): PhoneOtpReservation {
  return {
    id: fixtureId(serial),
    phoneE164: fixturePhone(serial),
    requestIp: `192.0.2.${(Math.floor(serial / 100) + 1).toString()}`,
    purpose: "sign_in",
    codeHmac,
    idempotencyKeyHash: hash(`otp-request-${serial.toString()}`),
    now: instant(),
    ...overrides,
  };
}

function reserve(input: OtpReservation) {
  return repository().transaction((tx) => tx.reserveOtpChallenge(input));
}

function matchesCode(stored: Uint8Array): boolean {
  return timingSafeEqual(stored, codeHmac);
}

function redeem(challengeId: string, now = instant(), compare = matchesCode) {
  return repository().transaction((tx) => tx.redeemOtp({ challengeId, now, matchesCode: compare }));
}

async function concurrently<Left, Right>(
  left: (tx: Transaction) => Promise<Left>,
  right: (tx: Transaction) => Promise<Right>,
) {
  const connection = openDatabase(database.url());
  try {
    return await Promise.all([
      repository().transaction(left),
      createAuthRepository(connection).transaction(right),
    ]);
  } finally {
    await connection.close();
  }
}

function rawToken(serial: number): string {
  return hash(`session-fixture-${serial.toString()}`).toString("base64url");
}

function session(
  serial: number,
  userId: string,
  overrides: Partial<SessionInsertion> = {},
): SessionInsertion {
  return {
    id: fixtureId(serial),
    userId,
    tokenHash: hash(rawToken(serial)),
    transport: "web",
    kind: "standard",
    deviceName: "Synthetic browser",
    requestIp: "192.0.2.1",
    now: instant(),
    ...overrides,
  };
}

async function createUser(serial: number) {
  const phoneE164 = fixturePhone(serial);
  const user = await repository().transaction((tx) =>
    tx.getOrCreateUserForSignIn({ phoneE164, now: instant() }),
  );
  expect(user.phoneE164).toBe(phoneE164);
  return { ...user, phoneE164 };
}

async function enrollAdmin(userId: string) {
  const encryptedSecret = hash(`synthetic encrypted TOTP fixture for ${userId}`);
  const { sql } = database.get();
  await sql`insert into admins (user_id, totp_secret_encrypted) values (${userId}, ${encryptedSecret})`;
  return encryptedSecret;
}

function insertSession(input: SessionInsertion) {
  return repository().transaction((tx) => tx.insertSession(input));
}

function resolveSession(input: SessionInsertion, now = instant()) {
  return repository().resolveSession({
    tokenHash: input.tokenHash,
    transport: input.transport,
    now,
  });
}

test("[AUTH-02:db] cooldown is shared across OTP purposes and ends after 45 seconds", async () => {
  const first = reservation(100);
  expect(await reserve(first)).toEqual({
    kind: "created",
    challenge: { id: first.id, expiresAt: instant(10 * minute), resendAt: instant(45 * second) },
  });

  const admin = reservation(101, { phoneE164: first.phoneE164, purpose: "admin_sign_in" });
  expect(await reserve({ ...admin, now: instant(45 * second - 1) })).toEqual({
    kind: "rate_limited",
    retryAt: instant(45 * second),
  });
  expect(await reserve({ ...admin, now: instant(45 * second) })).toMatchObject({ kind: "created" });
});

test("[AUTH-02:db] replay preserves original OTP timing and refuses purpose changes", async () => {
  const first = reservation(200);
  const created = await reserve(first);
  expect(created).toMatchObject({ kind: "created", challenge: { id: first.id } });

  const retry = reservation(201, {
    phoneE164: first.phoneE164,
    idempotencyKeyHash: first.idempotencyKeyHash,
    now: instant(10 * second),
  });
  expect(await reserve(retry)).toEqual({
    kind: "replayed",
    challenge: { id: first.id, expiresAt: instant(10 * minute), resendAt: instant(45 * second) },
  });
  expect(await reserve({ ...retry, purpose: "admin_sign_in" })).toEqual({ kind: "conflict" });
  expect(await reserve({ ...retry, phoneE164: fixturePhone(201) })).toMatchObject({
    kind: "created",
  });

  const { sql } = database.get();
  const rows = await sql`select id from otp_challenges where phone_e164 = ${first.phoneE164}`;
  expect([...rows]).toEqual([{ id: first.id }]);
});

test("[AUTH-02:db] a failed SMS callback leaves the same OTP deliverable", async () => {
  const challenge = reservation(210);
  await expect(reserve(challenge)).resolves.toMatchObject({ kind: "created" });
  const send = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("Fixture SMS failure"))
    .mockResolvedValue(undefined);

  await expect(repository().deliverOtp({ id: challenge.id, now: instant(), send })).rejects.toThrow(
    "Fixture SMS failure",
  );
  await expect(
    repository().deliverOtp({ id: challenge.id, now: instant(second), send }),
  ).resolves.toBe(true);
  await expect(
    repository().deliverOtp({ id: challenge.id, now: instant(10 * minute), send }),
  ).resolves.toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
});

test("[AUTH-02:db] concurrent retries send the same OTP once", async () => {
  const challenge = reservation(220);
  await expect(reserve(challenge)).resolves.toMatchObject({ kind: "created" });
  const send = vi.fn<() => void>();
  const connection = openDatabase(database.url());

  try {
    const input = { id: challenge.id, now: instant(), send };
    await expect(
      Promise.all([
        repository().deliverOtp(input),
        createAuthRepository(connection).deliverOtp(input),
      ]),
    ).resolves.toEqual([true, true]);
    expect(send).toHaveBeenCalledOnce();
  } finally {
    await connection.close();
  }
});

test("[AUTH-02:db] an unsent OTP cannot be delivered at its deadline", async () => {
  const challenge = reservation(230);
  await expect(reserve(challenge)).resolves.toMatchObject({ kind: "created" });
  const send = vi.fn<() => void>();
  await expect(
    repository().deliverOtp({ id: challenge.id, now: instant(10 * minute), send }),
  ).resolves.toBe(false);
  await expect(repository().deliverOtp({ id: fixtureId(231), now: instant(), send })).resolves.toBe(
    false,
  );
  expect(send).not.toHaveBeenCalled();
});

test("[AUTH-02:db] the rolling 15-minute phone cap spans both purposes", async () => {
  const phoneE164 = fixturePhone(300);
  for (const index of [0, 1, 2]) {
    const result = await reserve(
      reservation(300 + index, {
        phoneE164,
        purpose: index === 1 ? "admin_sign_in" : "sign_in",
        now: instant(index * 5 * minute),
      }),
    );
    expect(result).toMatchObject({ kind: "created" });
  }
  const fourth = reservation(303, { phoneE164, purpose: "admin_sign_in" });
  expect(await reserve({ ...fourth, now: instant(15 * minute - 1) })).toEqual({
    kind: "rate_limited",
    retryAt: instant(15 * minute),
  });
  expect(await reserve({ ...fourth, now: instant(15 * minute) })).toMatchObject({
    kind: "created",
  });
});

test("[AUTH-02:db] the rolling daily phone cap releases the oldest request at 24 hours", async () => {
  const phoneE164 = fixturePhone(400);
  for (let index = 0; index < 10; index += 1) {
    const result = await reserve(
      reservation(400 + index, { phoneE164, now: instant(index * 16 * minute) }),
    );
    expect(result).toMatchObject({ kind: "created" });
  }
  const eleventh = reservation(410, { phoneE164 });
  expect(await reserve({ ...eleventh, now: instant(day - 1) })).toEqual({
    kind: "rate_limited",
    retryAt: instant(day),
  });
  expect(await reserve({ ...eleventh, now: instant(day) })).toMatchObject({ kind: "created" });
});

test("[AUTH-02:db] simultaneous OTP requests for a phone cannot bypass cooldown", async () => {
  const first = reservation(500);
  const secondRequest = reservation(501, { phoneE164: first.phoneE164, purpose: "admin_sign_in" });
  const results = await concurrently(
    (tx) => tx.reserveOtpChallenge(first),
    (tx) => tx.reserveOtpChallenge(secondRequest),
  );

  expect(results.map(({ kind }) => kind).sort()).toEqual(["created", "rate_limited"]);
  expect(results).toContainEqual({ kind: "rate_limited", retryAt: instant(45 * second) });
});

test("[AUTH-02:db] simultaneous distinct phones share the rolling hourly IP cap", async () => {
  for (let index = 0; index < 19; index += 1) {
    const result = await reserve(reservation(600 + index, { now: instant(index * minute) }));
    expect(result).toMatchObject({ kind: "created" });
  }
  const now = instant(30 * minute);
  const results = await concurrently(
    (tx) => tx.reserveOtpChallenge(reservation(619, { now })),
    (tx) => tx.reserveOtpChallenge(reservation(620, { now, purpose: "admin_sign_in" })),
  );

  expect(results.map(({ kind }) => kind).sort()).toEqual(["created", "rate_limited"]);
  expect(results).toContainEqual({ kind: "rate_limited", retryAt: instant(hour) });
  expect(await reserve(reservation(621, { now: instant(hour) }))).toMatchObject({
    kind: "created",
  });
});

test("[AUTH-01:db] a fifth wrong OTP attempt locks the challenge", async () => {
  const challenge = reservation(700);
  const fifthChance = reservation(701);
  expect(await reserve(challenge)).toMatchObject({ kind: "created" });
  expect(await reserve(fifthChance)).toMatchObject({ kind: "created" });
  for (let attempt = 1; attempt < 5; attempt += 1) {
    const now = instant(attempt * second);
    expect(await redeem(challenge.id, now, () => false)).toEqual({ kind: "invalid" });
    expect(await redeem(fifthChance.id, now, () => false)).toEqual({
      kind: "invalid",
    });
  }
  expect(await redeem(challenge.id, instant(5 * second), () => false)).toEqual({ kind: "locked" });
  expect(await redeem(challenge.id, instant(6 * second))).toEqual({ kind: "locked" });
  expect(await redeem(fifthChance.id, instant(5 * second))).toMatchObject({ kind: "verified" });
});

test("[AUTH-01:db] OTP expires at five minutes, with the prior millisecond still valid", async () => {
  const valid = reservation(800);
  const expired = reservation(801);
  expect(await reserve(valid)).toMatchObject({ kind: "created" });
  expect(await reserve(expired)).toMatchObject({ kind: "created" });

  expect(await redeem(valid.id, instant(10 * minute - 1))).toEqual({
    kind: "verified",
    phoneE164: valid.phoneE164,
    purpose: "sign_in",
  });
  expect(await redeem(expired.id, instant(10 * minute))).toEqual({ kind: "expired" });
});

test("[AUTH-01:db] only one connection can redeem the same challenge", async () => {
  const challenge = reservation(900);
  expect(await reserve(challenge)).toMatchObject({ kind: "created" });
  const attempt = { challengeId: challenge.id, now: instant(second), matchesCode };
  const results = await concurrently(
    (tx) => tx.redeemOtp(attempt),
    (tx) => tx.redeemOtp(attempt),
  );

  expect(results.map(({ kind }) => kind).sort()).toEqual(["consumed", "verified"]);
  expect(results).toContainEqual({
    kind: "verified",
    phoneE164: challenge.phoneE164,
    purpose: "sign_in",
  });
});

test("[AUTH-01:db] keyed OTP retries share one failure and cannot issue a second credential", async () => {
  const challenge = reservation(980);
  expect(await reserve(challenge)).toMatchObject({ kind: "created" });
  const compare = vi.fn(() => false);
  const failed = {
    challengeId: challenge.id,
    now: instant(second),
    matchesCode: compare,
    attempt: verificationAttempt("otp-failed-key", "otp-wrong-fingerprint"),
  };

  expect(
    await concurrently(
      (tx) => tx.redeemOtp(failed),
      (tx) => tx.redeemOtp(failed),
    ),
  ).toEqual([{ kind: "invalid" }, { kind: "invalid" }]);
  expect(compare).toHaveBeenCalledOnce();

  const changed = { ...failed.attempt, requestHash: hash("otp-correct-fingerprint") };
  await expect(
    repository().transaction((tx) => tx.redeemOtp({ ...failed, matchesCode, attempt: changed })),
  ).resolves.toEqual({ kind: "idempotency_conflict" });

  const accepted = {
    ...failed,
    matchesCode,
    attempt: verificationAttempt("otp-success-key", "otp-correct-fingerprint"),
  };
  await expect(repository().transaction((tx) => tx.redeemOtp(accepted))).resolves.toMatchObject({
    kind: "verified",
  });
  await expect(repository().transaction((tx) => tx.redeemOtp(accepted))).resolves.toEqual({
    kind: "consumed",
  });
  await expect(repository().transaction((tx) => tx.redeemOtp(failed))).resolves.toEqual({
    kind: "invalid",
  });
  expect(compare).toHaveBeenCalledOnce();
});

test.each([
  { serial: 981, terminal: "expired", receiptCount: 0 },
  { serial: 982, terminal: "locked", receiptCount: 5 },
  { serial: 983, terminal: "consumed", receiptCount: 1 },
])(
  "[AUTH-01:db] fresh keys on $terminal OTP challenges leave $receiptCount receipts",
  async (fixture) => {
    const challenge = reservation(fixture.serial);
    expect(await reserve(challenge)).toMatchObject({ kind: "created" });
    const { id: challengeId } = challenge;

    for (let index = 0; index < fixture.receiptCount; index += 1) {
      const attempt = verificationAttempt(`effective-key-${index.toString()}`, "first-fingerprint");
      await repository().transaction((tx) =>
        tx.redeemOtp({
          challengeId,
          now: instant(),
          matchesCode: () => fixture.terminal === "consumed",
          attempt,
        }),
      );
    }

    const now = fixture.terminal === "expired" ? instant(10 * minute) : instant();
    for (const attempt of freshVerificationKeys) {
      await expect(
        repository().transaction((tx) => tx.redeemOtp({ challengeId, now, matchesCode, attempt })),
      ).resolves.toEqual({ kind: fixture.terminal });
    }

    const { sql } = database.get();
    const receipts = await sql`
    select key_hash from otp_verification_receipts where challenge_id = ${challengeId}
  `;
    expect(receipts).toHaveLength(fixture.receiptCount);
  },
);

test("[AUTH-01:db] a failed transaction rolls back OTP consumption, user creation and session issuance", async () => {
  const challenge = reservation(1_000);
  expect(await reserve(challenge)).toMatchObject({ kind: "created" });

  const sessionId = fixtureId(1_000);
  await expect(
    repository().transaction(async (tx) => {
      expect(
        await tx.redeemOtp({ challengeId: challenge.id, now: instant(), matchesCode }),
      ).toMatchObject({ kind: "verified" });
      const user = await tx.getOrCreateUserForSignIn({
        phoneE164: challenge.phoneE164,
        now: instant(),
      });
      const issued = await tx.insertSession(session(1_000, user.id));
      expect(issued.id).toBe(sessionId);
      throw new Error("fixture transaction aborted after issuing a session");
    }),
  ).rejects.toThrow("fixture transaction aborted after issuing a session");

  const { sql } = database.get();
  expect(await sql`select id from users where phone_e164 = ${challenge.phoneE164}`).toHaveLength(0);
  expect(await sql`select id from sessions where id = ${sessionId}`).toHaveLength(0);
  expect(await redeem(challenge.id)).toMatchObject({ kind: "verified" });
});

test("[AUTH-01:db] [AUTH-03:db] stores OTP and session digests instead of credentials", async () => {
  const challenge = reservation(1_100);
  expect(await reserve(challenge)).toMatchObject({ kind: "created" });
  const user = await createUser(1_100);
  const input = session(1_100, user.id);
  expect(await insertSession(input)).toMatchObject({ id: input.id });

  const { sql } = database.get();
  const [storedChallenge] = await sql<{ code: string; key: string; row: string }[]>`
    select encode(code_hmac, 'hex') as code, encode(idempotency_key_hash, 'hex') as key,
      row_to_json(otp_challenges)::text as row
    from otp_challenges where id = ${challenge.id}
  `;
  expect(storedChallenge).toMatchObject({
    code: codeHmac.toString("hex"),
    key: hash("otp-request-1100").toString("hex"),
  });
  expect(storedChallenge?.row).not.toContain(rawOtp);

  const [storedSession] = await sql<{ token: string; row: string }[]>`
    select encode(token_hash, 'hex') as token, row_to_json(sessions)::text as row
    from sessions where id = ${input.id}
  `;
  expect(storedSession).toMatchObject({ token: hash(rawToken(1_100)).toString("hex") });
  expect(storedSession?.row).not.toContain(rawToken(1_100));
});

test("[AUTH-03:db] session resolution binds transport and rolls the 30-day idle deadline", async () => {
  const user = await createUser(1_200);
  const input = session(1_200, user.id, { deviceName: "Synthetic phone", transport: "bearer" });
  const issued = await insertSession(input);
  expect(issued).toMatchObject({ expiresAt: instant(30 * day), deviceName: "Synthetic phone" });

  const wrongTransport = { ...input, transport: "web" } as const;
  expect(await resolveSession(wrongTransport, instant(29 * day))).toBeUndefined();
  expect(await repository().listSessions({ userId: user.id, now: instant(29 * day) })).toEqual([
    issued,
  ]);

  const seenAt = instant(30 * day - 1);
  const expiresAt = instant(60 * day - 1);
  expect(await resolveSession(input, seenAt)).toMatchObject({
    id: input.id,
    userId: user.id,
    transport: "bearer",
    kind: "standard",
    lastSeenAt: seenAt,
    expiresAt,
  });
  expect(await resolveSession(input, expiresAt)).toBeUndefined();
  expect(await repository().listSessions({ userId: user.id, now: expiresAt })).toEqual([]);
});

test("[AUTH-05:db] admin session expires at twelve hours despite recent activity", async () => {
  const user = await createUser(1_300);
  await enrollAdmin(user.id);
  const input = session(1_300, user.id, { kind: "admin" });
  expect(await insertSession(input)).toMatchObject({ expiresAt: instant(12 * hour) });

  const seenAt = instant(12 * hour - 1);
  expect(await resolveSession(input, seenAt)).toMatchObject({
    kind: "admin",
    lastSeenAt: seenAt,
    expiresAt: instant(12 * hour),
  });
  expect(await resolveSession(input, instant(12 * hour))).toBeUndefined();
});

test("[AUTH-03:db] lists and revokes only sessions owned by the supplied user", async () => {
  const owner = await createUser(1_400);
  const other = await createUser(1_401);
  const web = session(1_400, owner.id);
  const bearer = session(1_401, owner.id, { transport: "bearer", deviceName: null });
  const unrelated = session(1_402, other.id);
  const devices = [await insertSession(web), await insertSession(bearer)];
  await insertSession(unrelated);

  const listed = await repository().listSessions({ userId: owner.id, now: instant() });
  expect(listed).toHaveLength(2);
  expect(listed).toEqual(expect.arrayContaining(devices));

  const revoke = (userId: string, scope: Parameters<Transaction["revokeSessions"]>[0]["scope"]) =>
    repository().transaction((tx) => tx.revokeSessions({ userId, scope, now: instant(second) }));

  expect(await revoke(other.id, { kind: "one", sessionId: web.id })).toBe(0);
  expect(await revoke(owner.id, { kind: "one", sessionId: web.id })).toBe(1);
  expect(await resolveSession(web, instant(2 * second))).toBeUndefined();
  expect(await resolveSession(bearer, instant(2 * second))).toMatchObject({ id: bearer.id });
  expect(await revoke(owner.id, { kind: "all" })).toBe(1);
  expect(await resolveSession(bearer, instant(2 * second))).toBeUndefined();
  expect(await resolveSession(unrelated, instant(2 * second))).toMatchObject({ id: unrelated.id });
  expect(await repository().listSessions({ userId: owner.id, now: instant(2 * second) })).toEqual(
    [],
  );
});

test("[AUTH-05:db] a TOTP step cannot be consumed by two challenges for one admin", async () => {
  const user = await createUser(1_500);
  const encryptedSecret = await enrollAdmin(user.id);

  for (const offset of [0, 1]) {
    const id = fixtureId(1_500 + offset);
    const now = instant(offset * 45 * second);
    const challenge = reservation(1_500 + offset, {
      phoneE164: user.phoneE164,
      purpose: "admin_sign_in",
      now,
    });
    expect(await reserve(challenge)).toMatchObject({ kind: "created" });
    await repository().transaction(async (tx) => {
      expect(await tx.redeemOtp({ challengeId: challenge.id, now, matchesCode })).toMatchObject({
        kind: "verified",
        purpose: "admin_sign_in",
      });
      expect(
        await tx.insertAdminChallenge({
          id,
          userId: user.id,
          otpChallengeId: challenge.id,
          transport: "web",
          now,
        }),
      ).toBe(true);
    });
  }

  const now = instant(46 * second);
  const step = Math.floor(now.getTime() / (30 * second));
  const matchTotp = (secret: Uint8Array) => {
    expect(Buffer.from(secret)).toEqual(encryptedSecret);
    return step;
  };
  const attempt = { transport: "web", now, matchTotp } as const;
  expect(
    await repository().transaction((tx) =>
      tx.redeemAdminChallenge({
        ...attempt,
        challengeId: fixtureId(1_500),
        transport: "bearer",
      }),
    ),
  ).toEqual({ kind: "invalid" });
  const results = await concurrently(
    (tx) => tx.redeemAdminChallenge({ ...attempt, challengeId: fixtureId(1_500) }),
    (tx) => tx.redeemAdminChallenge({ ...attempt, challengeId: fixtureId(1_501) }),
  );
  expect(results.map(({ kind }) => kind).sort()).toEqual(["replayed", "verified"]);
  expect(results).toContainEqual({ kind: "verified", userId: user.id });
  const replayedChallenge = fixtureId(results[0].kind === "replayed" ? 1_500 : 1_501);
  for (const freshAttempt of freshVerificationKeys) {
    await expect(
      repository().transaction((tx) =>
        tx.redeemAdminChallenge({
          ...attempt,
          challengeId: replayedChallenge,
          attempt: freshAttempt,
        }),
      ),
    ).resolves.toEqual({ kind: "replayed" });
  }
  const { sql } = database.get();
  const receipts = await sql`
    select key_hash from admin_verification_receipts where challenge_id = ${replayedChallenge}
  `;
  expect(receipts).toHaveLength(0);
});

test("[AUTH-05:db] keyed TOTP retries share one failure and cannot issue a second credential", async () => {
  const user = await createUser(1_600);
  await enrollAdmin(user.id);
  const otp = reservation(1_600, { phoneE164: user.phoneE164, purpose: "admin_sign_in" });
  expect(await reserve(otp)).toMatchObject({ kind: "created" });

  const challengeId = fixtureId(1_601);
  const now = instant(second);
  await repository().transaction(async (tx) => {
    expect(await tx.redeemOtp({ challengeId: otp.id, now, matchesCode })).toMatchObject({
      kind: "verified",
    });
    expect(
      await tx.insertAdminChallenge({
        id: challengeId,
        userId: user.id,
        otpChallengeId: otp.id,
        transport: "web",
        now,
      }),
    ).toBe(true);
  });

  const matchInvalid = vi.fn(() => undefined);
  const failed = {
    challengeId,
    transport: "web" as const,
    now,
    matchTotp: matchInvalid,
    attempt: verificationAttempt("totp-failed-key", "totp-wrong-fingerprint"),
  };
  expect(
    await concurrently(
      (tx) => tx.redeemAdminChallenge(failed),
      (tx) => tx.redeemAdminChallenge(failed),
    ),
  ).toEqual([{ kind: "invalid" }, { kind: "invalid" }]);
  expect(matchInvalid).toHaveBeenCalledOnce();

  const matchValid = () => Math.floor(now.getTime() / (30 * second));
  const changed = { ...failed.attempt, requestHash: hash("totp-correct-fingerprint") };
  await expect(
    repository().transaction((tx) =>
      tx.redeemAdminChallenge({ ...failed, matchTotp: matchValid, attempt: changed }),
    ),
  ).resolves.toEqual({ kind: "idempotency_conflict" });

  const accepted = {
    ...failed,
    matchTotp: matchValid,
    attempt: verificationAttempt("totp-success-key", "totp-correct-fingerprint"),
  };
  await expect(
    repository().transaction((tx) => tx.redeemAdminChallenge(accepted)),
  ).resolves.toEqual({ kind: "verified", userId: user.id });
  await expect(
    repository().transaction((tx) => tx.redeemAdminChallenge(accepted)),
  ).resolves.toEqual({ kind: "consumed" });
  await expect(repository().transaction((tx) => tx.redeemAdminChallenge(failed))).resolves.toEqual({
    kind: "invalid",
  });
  expect(matchInvalid).toHaveBeenCalledOnce();
  for (const attempt of freshVerificationKeys) {
    await expect(
      repository().transaction((tx) => tx.redeemAdminChallenge({ ...accepted, attempt })),
    ).resolves.toEqual({ kind: "consumed" });
  }
  const { sql } = database.get();
  const receipts = await sql`
    select key_hash from admin_verification_receipts where challenge_id = ${challengeId}
  `;
  expect(receipts).toHaveLength(2);
});
