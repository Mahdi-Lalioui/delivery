import { randomUUIDv7 } from "node:crypto";
import {
  requestOtpOutput,
  sessionListOutput,
  verifyOtpOutput,
  verifyTotpOutput,
} from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { FastifyInstance } from "fastify";
import { expect, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { hashOtp, hashSessionToken } from "../src/auth-crypto.ts";
import { sealTotpSecret } from "../src/auth-totp.ts";
import { startApi } from "../src/start.ts";

const database = registerTestDatabase();
const publicOrigin = "https://zaafran.test";
const otpKey = Buffer.alloc(32, 19);
const totpKey = Buffer.alloc(32, 26);
const originHeaders = { origin: publicOrigin, "sec-fetch-site": "same-origin" };

async function openAuthApi(at = Date.parse("2026-11-07T12:00:00Z")) {
  let time = at;
  const sent = new Map<string, string>();
  const emails = new Map<string, { email: string; code: string }>();
  const attempts: string[] = [];
  let shouldFail = false;
  const api = await startApi({
    environment: {
      DATABASE_URL: database.url(),
      AUTH_PUBLIC_ORIGIN: publicOrigin,
      AUTH_OTP_KEY: otpKey.toString("hex"),
      AUTH_TOTP_KEY: totpKey.toString("hex"),
    },
    now: () => new Date(time),
    sendSms({ deliveryKey, code }) {
      attempts.push(deliveryKey);
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Synthetic SMS outage");
      }
      sent.set(deliveryKey, code);
    },
    sendEmail({ deliveryKey, email, code }) {
      emails.set(deliveryKey, { email, code });
    },
    async listen(app) {
      await app.ready();
      return "http://127.0.0.1:3002";
    },
  });
  return {
    api,
    sent,
    emails,
    attempts,
    now() {
      return new Date(time);
    },
    failNextDelivery() {
      shouldFail = true;
    },
    advance(milliseconds: number) {
      time += milliseconds;
    },
  };
}

function requestOtp(
  api: FastifyInstance,
  phone: string,
  options: { purpose?: "sign_in" | "admin_sign_in"; key?: string } = {},
) {
  return api.inject({
    method: "POST",
    url: "/v1/auth/otp/request",
    headers: { ...originHeaders, "idempotency-key": options.key ?? randomUUIDv7() },
    payload: { phone, purpose: options.purpose ?? "sign_in" },
  });
}

function verifyOtp(
  api: FastifyInstance,
  {
    challengeId,
    code,
    transport = "web",
    key = randomUUIDv7(),
  }: {
    challengeId: string;
    code: string;
    transport?: "web" | "bearer";
    key?: string;
  },
) {
  return api.inject({
    method: "POST",
    url: "/v1/auth/otp/verify",
    headers: { ...(transport === "web" ? originHeaders : {}), "idempotency-key": key },
    payload: { challengeId, code, transport },
  });
}

async function loginWeb(api: FastifyInstance, sent: Map<string, string>, phone: string) {
  const challenge = requestOtpOutput.parse((await requestOtp(api, phone)).json());
  const code = sent.get(challenge.challengeId);
  if (!code) throw new Error("Missing synthetic OTP.");
  const response = await verifyOtp(api, { challengeId: challenge.challengeId, code });
  const cookie = response.cookies.find(({ name }) => name === "__Host-session");
  if (!cookie) throw new Error("Missing session cookie.");
  return { challenge, code, response, cookie };
}

test("[AUTH-01] [AUTH-03] [AUTH-09] uses live Postgres for HMAC and opaque web sessions", async () => {
  const auth = await openAuthApi();
  const { api, sent } = auth;
  try {
    const phone = "+213500000010";
    const otherPhone = "+213500000044";
    const { challenge, code, response, cookie } = await loginWeb(api, sent, phone);
    expect(response.statusCode).toBe(200);
    expect(verifyOtpOutput.parse(response.json())).toEqual({
      status: "authenticated",
      transport: "web",
    });
    expect(cookie).toMatchObject({ path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
    expect(cookie).not.toHaveProperty("domain");
    const [stored] = await database.get().sql<{ codeHmac: Buffer }[]>`
      SELECT code_hmac AS "codeHmac" FROM otp_challenges WHERE id = ${challenge.challengeId}
    `;
    expect(stored?.codeHmac).toEqual(
      hashOtp({ key: otpKey, challengeId: challenge.challengeId, code }),
    );
    const [session] = await database.get().sql<{ tokenHash: Buffer }[]>`
      SELECT token_hash AS "tokenHash" FROM sessions
      JOIN users ON users.id = sessions.user_id WHERE users.phone_e164 = '+213500000010'
    `;
    expect(session?.tokenHash).toEqual(hashSessionToken(cookie.value));

    const cookieHeader = { cookie: "__Host-session=" + cookie.value };
    auth.advance(61_000);
    const secondOwnerLogin = await loginWeb(api, sent, phone);
    const secondOwnerCookie = {
      cookie: "__Host-session=" + secondOwnerLogin.cookie.value,
    };
    const otherLogin = await loginWeb(api, sent, otherPhone);
    const otherCookieHeader = { cookie: "__Host-session=" + otherLogin.cookie.value };

    const listed = await api.inject({ url: "/v1/me/sessions", headers: cookieHeader });
    const ownerSessions = sessionListOutput.parse(listed.json()).sessions;
    expect(ownerSessions).toHaveLength(2);
    expect(ownerSessions.filter(({ current: isCurrent }) => isCurrent)).toHaveLength(1);
    const secondOwnerSessions = sessionListOutput.parse(
      (await api.inject({ url: "/v1/me/sessions", headers: secondOwnerCookie })).json(),
    ).sessions;
    expect(secondOwnerSessions.map(({ id }) => id).sort()).toEqual(
      ownerSessions.map(({ id }) => id).sort(),
    );
    const otherSessions = sessionListOutput.parse(
      (await api.inject({ url: "/v1/me/sessions", headers: otherCookieHeader })).json(),
    ).sessions;
    expect(otherSessions).toHaveLength(1);
    expect(ownerSessions.map(({ id }) => id)).not.toContain(otherSessions[0]?.id);

    const secondOwnerSession = ownerSessions.find(({ current: isCurrent }) => !isCurrent);
    if (!secondOwnerSession) throw new Error("Expected the other owner device session");
    const foreignRevoke = await api.inject({
      method: "DELETE",
      url: "/v1/me/sessions/" + secondOwnerSession.id,
      headers: { ...originHeaders, ...otherCookieHeader },
    });
    expect(foreignRevoke.statusCode).toBe(404);
    expect(problemResponseSchema.parse(foreignRevoke.json())).toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(
      sessionListOutput.parse(
        (await api.inject({ url: "/v1/me/sessions", headers: cookieHeader })).json(),
      ).sessions,
    ).toHaveLength(2);

    const ownRevoke = await api.inject({
      method: "DELETE",
      url: "/v1/me/sessions/" + secondOwnerSession.id,
      headers: { ...originHeaders, ...cookieHeader },
    });
    expect(ownRevoke.statusCode).toBe(204);
    expect(
      (await api.inject({ url: "/v1/me/sessions", headers: secondOwnerCookie })).statusCode,
    ).toBe(401);
    const ownerOnlySession = sessionListOutput.parse(
      (await api.inject({ url: "/v1/me/sessions", headers: cookieHeader })).json(),
    ).sessions;
    expect(ownerOnlySession).toHaveLength(1);
    const [current] = ownerOnlySession;
    if (!current?.current) throw new Error("Expected the current owner session");

    auth.advance(61_000);
    const thirdOwnerLogin = await loginWeb(api, sent, phone);
    const thirdOwnerCookie = {
      cookie: "__Host-session=" + thirdOwnerLogin.cookie.value,
    };
    const beforeLogoutAll = sessionListOutput.parse(
      (await api.inject({ url: "/v1/me/sessions", headers: cookieHeader })).json(),
    ).sessions;
    expect(beforeLogoutAll).toHaveLength(2);
    expect(
      (await api.inject({ url: "/v1/me/sessions", headers: thirdOwnerCookie })).statusCode,
    ).toBe(200);

    const logout = await api.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { ...originHeaders, ...cookieHeader, "idempotency-key": randomUUIDv7() },
      payload: { scope: "all", expectedSessionId: current.id },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.cookies).toMatchObject([{ name: "__Host-session", maxAge: 0 }]);
    expect((await api.inject({ url: "/v1/me/sessions", headers: cookieHeader })).statusCode).toBe(
      401,
    );
    expect(
      (await api.inject({ url: "/v1/me/sessions", headers: thirdOwnerCookie })).statusCode,
    ).toBe(401);
    expect(
      (await api.inject({ url: "/v1/me/sessions", headers: otherCookieHeader })).statusCode,
    ).toBe(200);
    const activeAt = auth.now().toISOString();
    const activeSessions = await database.get().sql<{ phoneE164: string; count: number }[]>`
      SELECT users.phone_e164 AS "phoneE164", count(sessions.id)::int AS count
      FROM public.users LEFT JOIN public.sessions ON sessions.user_id = users.id
        AND sessions.revoked_at IS NULL AND sessions.expires_at > ${activeAt}::timestamptz
      WHERE users.phone_e164 = ANY(${[phone, otherPhone]})
      GROUP BY users.phone_e164 ORDER BY users.phone_e164
    `;
    expect([...activeSessions]).toEqual([
      { phoneE164: phone, count: 0 },
      { phoneE164: otherPhone, count: 1 },
    ]);
  } finally {
    await api.close();
  }
});

test("[AUTH-03] OTP verification replaces any pre-authentication session token", async () => {
  const { api, sent } = await openAuthApi();
  const knownToken = "A".repeat(43);
  try {
    const challenge = requestOtpOutput.parse((await requestOtp(api, "+213500000019")).json());
    const code = sent.get(challenge.challengeId);
    if (!code) throw new Error("Missing synthetic OTP.");
    const response = await api.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      headers: {
        ...originHeaders,
        cookie: "__Host-session=" + knownToken,
        "idempotency-key": randomUUIDv7(),
      },
      payload: { challengeId: challenge.challengeId, code, transport: "web" },
    });
    const cookie = response.cookies.find(({ name }) => name === "__Host-session");
    if (!cookie) throw new Error("Missing authenticated session cookie.");
    expect(cookie.value).not.toBe(knownToken);
    expect(
      (
        await api.inject({
          url: "/v1/me/sessions",
          headers: { cookie: "__Host-session=" + knownToken },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await api.inject({
          url: "/v1/me/sessions",
          headers: { cookie: "__Host-session=" + cookie.value },
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await api.close();
  }
});

test("[AUTH-02] retries SMS delivery under the original challenge and enforces cooldown", async () => {
  const runtime = await openAuthApi();
  const { api, sent, attempts } = runtime;
  const phone = "+213600000010";
  const key = randomUUIDv7();
  try {
    runtime.failNextDelivery();
    const unavailable = await requestOtp(api, phone, { key });
    expect(unavailable.statusCode).toBe(503);
    expect(problemResponseSchema.parse(unavailable.json()).code).toBe("otp_delivery_unavailable");
    const recovered = await requestOtp(api, phone, { key });
    expect(recovered.statusCode).toBe(202);
    const original = requestOtpOutput.parse(recovered.json());
    expect(sent.get(original.challengeId)).toMatch(/^[0-9]{6}$/);
    expect(attempts).toEqual([original.challengeId, original.challengeId]);
    expect(requestOtpOutput.parse((await requestOtp(api, phone, { key })).json())).toEqual(
      original,
    );
    expect(attempts).toHaveLength(2);
    const limited = await requestOtp(api, phone);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("45");
    runtime.advance(45_000);
    expect((await requestOtp(api, phone)).statusCode).toBe(202);
  } finally {
    await api.close();
  }
});

test("[AUTH-04] rejects cross-origin cookie writes before revoking an active session", async () => {
  const { api, sent } = await openAuthApi();
  try {
    const { cookie } = await loginWeb(api, sent, "+213700000010");
    const cookieHeader = { cookie: "__Host-session=" + cookie.value };
    const list = () => api.inject({ url: "/v1/me/sessions", headers: cookieHeader });
    const current = sessionListOutput
      .parse((await list()).json())
      .sessions.find(({ current }) => current);
    if (!current) throw new Error("Missing current session");
    const logout = (metadata: Record<string, string>) =>
      api.inject({
        method: "POST",
        url: "/v1/auth/logout",
        headers: { ...cookieHeader, ...metadata, "idempotency-key": randomUUIDv7() },
        payload: { scope: "all", expectedSessionId: current.id },
      });

    for (const metadata of [
      { origin: "https://other.test", "sec-fetch-site": "cross-site" },
      { origin: "https://other.zaafran.test", "sec-fetch-site": "same-site" },
      { origin: publicOrigin, "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-origin" },
    ]) {
      expect((await logout(metadata)).statusCode).toBe(403);
      expect((await list()).statusCode).toBe(200);
    }

    expect((await logout(originHeaders)).statusCode).toBe(204);
    expect((await list()).statusCode).toBe(401);
  } finally {
    await api.close();
  }
});

test("[CUS-10] distinguishes invalid, locked and expired codes through the real API", async () => {
  const runtime = await openAuthApi();
  const { api, sent } = runtime;
  const phone = "+213500000011";
  try {
    const { challengeId } = requestOtpOutput.parse((await requestOtp(api, phone)).json());
    const code = sent.get(challengeId);
    if (!code) throw new Error("Missing synthetic OTP.");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await verifyOtp(api, { challengeId, code: wrong });
      expect(problemResponseSchema.parse(response.json()).code).toBe(
        attempt === 5 ? "otp_locked" : "otp_invalid",
      );
    }
    runtime.advance(45_000);
    const next = requestOtpOutput.parse((await requestOtp(api, phone)).json());
    runtime.advance(600_000);
    const expired = await verifyOtp(api, { challengeId: next.challengeId, code: wrong });
    expect(expired.statusCode).toBe(410);
    expect(problemResponseSchema.parse(expired.json()).code).toBe("otp_expired");
  } finally {
    await api.close();
  }
});

test("[AUTH-05] requires the enrolled TOTP for admin and enforces its absolute expiry", async () => {
  const clock = 2_000_000_000_000;
  const runtime = await openAuthApi(clock);
  const { api, sent } = runtime;
  const phone = "+213600000011";
  const userId = randomUUIDv7();
  const secret = Buffer.from("12345678901234567890");
  const sealed = sealTotpSecret({ key: totpKey, userId, secret });
  try {
    await database.get()
      .sql`INSERT INTO users (id, phone_e164, created_at) VALUES (${userId}, ${phone}, ${new Date(clock).toISOString()}::timestamptz)`;
    await database.get()
      .sql`INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${userId}, ${sealed})`;
    const { challengeId } = requestOtpOutput.parse(
      (await requestOtp(api, phone, { purpose: "admin_sign_in" })).json(),
    );
    const code = sent.get(challengeId);
    if (!code) throw new Error("Missing synthetic OTP.");
    const otp = await verifyOtp(api, { challengeId, code, transport: "bearer" });
    const pending = verifyOtpOutput.parse(otp.json());
    expect(otp.cookies).toHaveLength(0);
    if (pending.status !== "totp_required") throw new Error("Expected a pending admin factor.");
    const totp = await api.inject({
      method: "POST",
      url: "/v1/auth/totp/verify",
      headers: { "idempotency-key": randomUUIDv7() },
      payload: { challengeId: pending.challengeId, code: "279037", transport: "bearer" },
    });
    expect(totp.statusCode).toBe(200);
    const session = verifyTotpOutput.parse(totp.json());
    if (session.transport !== "bearer") throw new Error("Missing bearer session.");
    const authorization = "Bearer " + session.token;
    const check = () => api.inject({ url: "/v1/me/sessions", headers: { authorization } });
    expect((await check()).statusCode).toBe(200);
    runtime.advance(43_199_000);
    expect((await check()).statusCode).toBe(200);
    runtime.advance(1_000);
    expect((await check()).statusCode).toBe(401);
  } finally {
    await api.close();
  }
});

test("[AUTH-05:abuse] locks an administrator TOTP challenge after five incorrect codes", async () => {
  const clock = 2_000_000_000_000;
  const { api, sent } = await openAuthApi(clock);
  const phone = "+213600000012";
  const userId = randomUUIDv7();
  const sealed = sealTotpSecret({
    key: totpKey,
    userId,
    secret: Buffer.from("12345678901234567890"),
  });
  try {
    await database.get()
      .sql`INSERT INTO users (id, phone_e164, created_at) VALUES (${userId}, ${phone}, ${new Date(clock).toISOString()}::timestamptz)`;
    await database.get()
      .sql`INSERT INTO admins (user_id, totp_secret_encrypted) VALUES (${userId}, ${sealed})`;
    const { challengeId } = requestOtpOutput.parse(
      (await requestOtp(api, phone, { purpose: "admin_sign_in" })).json(),
    );
    const firstFactorCode = sent.get(challengeId);
    if (!firstFactorCode) throw new Error("Missing synthetic admin OTP.");
    const firstFactor = await verifyOtp(api, {
      challengeId,
      code: firstFactorCode,
      transport: "bearer",
    });
    const pending = verifyOtpOutput.parse(firstFactor.json());
    if (pending.status !== "totp_required") throw new Error("Expected a pending admin factor.");

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await api.inject({
        method: "POST",
        url: "/v1/auth/totp/verify",
        headers: { "idempotency-key": randomUUIDv7() },
        payload: { challengeId: pending.challengeId, code: "000000", transport: "bearer" },
      });
      expect(response.statusCode).toBe(attempt === 5 ? 429 : 401);
      expect(problemResponseSchema.parse(response.json()).code).toBe(
        attempt === 5 ? "totp_locked" : "totp_invalid",
      );
    }

    const validCodeAfterLock = await api.inject({
      method: "POST",
      url: "/v1/auth/totp/verify",
      headers: { "idempotency-key": randomUUIDv7() },
      payload: { challengeId: pending.challengeId, code: "279037", transport: "bearer" },
    });
    expect(validCodeAfterLock.statusCode).toBe(429);
    expect(problemResponseSchema.parse(validCodeAfterLock.json()).code).toBe("totp_locked");
    expect(validCodeAfterLock.cookies).toHaveLength(0);
    const [storedChallenge] = await database.get().sql<{ attempts: number }[]>`
      SELECT attempts FROM public.admin_challenges WHERE id = ${pending.challengeId}
    `;
    expect(storedChallenge?.attempts).toBe(5);
    expect(
      await database.get().sql`SELECT FROM public.sessions WHERE user_id = ${userId}`,
    ).toHaveLength(0);
  } finally {
    await api.close();
  }
});

test("[AUTH-01:replay] one wrong verification consumes one attempt across identical retries", async () => {
  const { api, sent } = await openAuthApi();
  const phone = "+213700000011";
  try {
    const { challengeId } = requestOtpOutput.parse((await requestOtp(api, phone)).json());
    const code = sent.get(challengeId);
    if (!code) throw new Error("Missing synthetic OTP.");
    const wrong = code === "000000" ? "111111" : "000000";
    const key = randomUUIDv7();
    for (let repeat = 0; repeat < 5; repeat += 1) {
      const response = await verifyOtp(api, { challengeId, code: wrong, key });
      expect(problemResponseSchema.parse(response.json()).code).toBe("otp_invalid");
    }
    const conflicting = await verifyOtp(api, { challengeId, code, key });
    expect(conflicting.statusCode).toBe(409);
    expect(problemResponseSchema.parse(conflicting.json()).code).toBe("idempotency_conflict");
    const [challenge] = await database.get().sql<{ attempts: number }[]>`
      SELECT attempts FROM otp_challenges WHERE id = ${challengeId}
    `;
    expect(challenge?.attempts).toBe(1);
    expect((await verifyOtp(api, { challengeId, code })).statusCode).toBe(200);
  } finally {
    await api.close();
  }
});

test("[AUTH-01][AUTH-02] signs in by normalized email with one HMAC-protected OTP and a shared cooldown", async () => {
  const runtime = await openAuthApi();
  const { api, emails } = runtime;
  const email = "buyer@example.test";
  const start = (address: string) =>
    api.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      headers: { ...originHeaders, "idempotency-key": randomUUIDv7() },
      payload: { email: address, purpose: "sign_in", locale: "fr" },
    });
  try {
    const first = await start(" Buyer@EXAMPLE.TEST ");
    expect(first.statusCode).toBe(202);
    const { challengeId, expiresAt, resendAt } = requestOtpOutput.parse(first.json());
    expect(expiresAt).toBe("2026-11-07T12:10:00.000Z");
    expect(resendAt).toBe("2026-11-07T12:00:45.000Z");
    expect(first.payload).not.toContain(email);
    expect((await start(email)).statusCode).toBe(429);
    const delivery = emails.get(challengeId);
    expect(delivery?.email).toBe(email);
    if (!delivery) throw new Error("Missing synthetic email OTP");
    const [stored] = await database.get().sql<{ codeHmac: Buffer }[]>`
      SELECT code_hmac AS "codeHmac" FROM otp_challenges WHERE id = ${challengeId}
    `;
    expect(stored?.codeHmac).toEqual(hashOtp({ key: otpKey, challengeId, code: delivery.code }));
    const firstLogin = await verifyOtp(api, { challengeId, code: delivery.code });
    expect(verifyOtpOutput.parse(firstLogin.json())).toEqual({
      status: "authenticated",
      transport: "web",
    });
    expect((await verifyOtp(api, { challengeId, code: delivery.code })).statusCode).toBe(409);
    const accounts = await database.get().sql`SELECT phone_e164 FROM users WHERE email = ${email}`;
    expect(accounts).toEqual([{ phone_e164: null }]);
    runtime.advance(45_000);
    const returning = await start(email);
    expect(returning.statusCode).toBe(202);
    expect(Object.keys(returning.json<Record<string, unknown>>()).sort()).toEqual(
      Object.keys(first.json<Record<string, unknown>>()).sort(),
    );
  } finally {
    await api.close();
  }
});

test("[AUTH-01][AUTH-02] locks email OTP at five wrong codes and shares the IP quota with phone", async () => {
  const runtime = await openAuthApi();
  const { api, attempts, emails } = runtime;
  const ip = "198.51.100.72";
  async function start(target: { email: string } | { phone: string }) {
    return api.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      headers: { ...originHeaders, "idempotency-key": randomUUIDv7() },
      remoteAddress: ip,
      payload: { ...target, purpose: "sign_in" },
    });
  }
  try {
    const response = await start({ email: "locked@example.test" });
    expect(response.statusCode).toBe(202);
    const { challengeId } = requestOtpOutput.parse(response.json());
    const message = emails.get(challengeId);
    if (!message) throw new Error("Missing email delivery.");
    const wrong = message.code === "000000" ? "111111" : "000000";
    for (let index = 1; index <= 5; index++) {
      const attempted = await verifyOtp(api, { challengeId, code: wrong });
      expect(problemResponseSchema.parse(attempted.json()).code).toBe(
        index < 5 ? "otp_invalid" : "otp_locked",
      );
    }
    const denied = await verifyOtp(api, { challengeId, code: message.code });
    expect(problemResponseSchema.parse(denied.json()).code).toBe("otp_locked");
    for (let index = 1; index < 20; index++) {
      const phone = "+2135" + String(400 + index).padStart(8, "0");
      expect((await start({ phone })).statusCode).toBe(202);
    }
    const deniedRequests = await Promise.all([
      start({ email: "another@example.test" }),
      start({ phone: "+213500000420" }),
    ]);
    for (const deniedRequest of deniedRequests) {
      expect(deniedRequest.statusCode).toBe(429);
      expect(problemResponseSchema.parse(deniedRequest.json()).code).toBe("otp_rate_limited");
    }
    expect(emails.size).toBe(1);
    expect(attempts).toHaveLength(19);
  } finally {
    await api.close();
  }
});

test("[AUTH-05] email-admin sign-in still requires enrolled TOTP", async () => {
  const clock = 2_000_000_000_000;
  const runtime = await openAuthApi(clock);
  const { api, emails } = runtime;
  const email = "admin@example.test";
  const userId = randomUUIDv7();
  const secret = Buffer.from("12345678901234567890");
  const sealed = sealTotpSecret({ key: totpKey, userId, secret });
  const { sql } = database.get();
  try {
    await sql`INSERT INTO public.users (id, email, created_at) VALUES (${userId}, ${email}, ${new Date(clock).toISOString()})`;
    await sql`INSERT INTO public.admins (user_id, totp_secret_encrypted) VALUES (${userId}, ${sealed})`;
    const start = await api.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      headers: { ...originHeaders, "idempotency-key": randomUUIDv7() },
      payload: { email: "ADMIN@example.test", purpose: "admin_sign_in" },
    });
    const { challengeId } = requestOtpOutput.parse(start.json());
    const message = emails.get(challengeId);
    if (!message) throw new Error("Missing email delivery.");
    const firstFactor = await verifyOtp(api, {
      challengeId,
      code: message.code,
      transport: "bearer",
    });
    expect(firstFactor.cookies).toHaveLength(0);
    const pending = verifyOtpOutput.parse(firstFactor.json());
    if (pending.status !== "totp_required") throw new Error("Expected TOTP for the email admin.");
    const totp = await api.inject({
      method: "POST",
      url: "/v1/auth/totp/verify",
      headers: { "idempotency-key": randomUUIDv7() },
      payload: { challengeId: pending.challengeId, code: "279037", transport: "bearer" },
    });
    expect(totp.statusCode).toBe(200);
    expect(verifyTotpOutput.parse(totp.json())).toMatchObject({ transport: "bearer" });
  } finally {
    await api.close();
  }
});

test("[AUTH-01] links an email with a code and preserves the authenticated phone account", async () => {
  const auth = await openAuthApi();
  const { api, emails, sent } = auth;
  const phone = "+213500000042";
  const otherPhone = "+213500000043";
  const email = "linked@example.test";
  try {
    expect((await api.inject({ url: "/v1/auth/methods" })).json()).toEqual({
      methods: ["phone", "email"],
    });
    const { cookie } = await loginWeb(api, sent, phone);
    const sessionHeaders = { ...originHeaders, cookie: "__Host-session=" + cookie.value };
    const initial = await api.inject({ url: "/v1/me/identifiers", headers: sessionHeaders });
    expect(initial.statusCode).toBe(200);
    const profile = initial.json<{ sessionId: string; phone: string; email: string | null }>();
    expect(profile).toMatchObject({ phone, email: null });
    const commandHeaders = {
      ...sessionHeaders,
      "x-expected-session-id": profile.sessionId,
      "idempotency-key": randomUUIDv7(),
    };
    const challenge = await api.inject({
      method: "POST",
      url: "/v1/me/identifiers/challenge",
      headers: commandHeaders,
      payload: { email: " Linked@EXAMPLE.TEST ", locale: "ar" },
    });
    expect(challenge.statusCode).toBe(202);
    const { challengeId } = requestOtpOutput.parse(challenge.json());
    const message = emails.get(challengeId);
    if (!message) throw new Error("Missing identifier change code.");
    expect(message.email).toBe(email);
    expect((await verifyOtp(api, { challengeId, code: message.code })).statusCode).toBe(401);

    auth.advance(61_000);
    const { cookie: secondOwnerCookie } = await loginWeb(api, sent, phone);
    const secondOwnerHeaders = {
      ...originHeaders,
      cookie: "__Host-session=" + secondOwnerCookie.value,
    };
    const secondOwnerProfile = await api.inject({
      url: "/v1/me/identifiers",
      headers: secondOwnerHeaders,
    });
    expect(secondOwnerProfile.json()).toMatchObject({ phone, email: null });
    const secondSessionAttempt = await api.inject({
      method: "PUT",
      url: "/v1/me/identifiers",
      headers: {
        ...secondOwnerHeaders,
        "x-expected-session-id": secondOwnerProfile.json<{ sessionId: string }>().sessionId,
        "idempotency-key": randomUUIDv7(),
      },
      payload: { challengeId, code: message.code },
    });
    expect(problemResponseSchema.parse(secondSessionAttempt.json())).toMatchObject({
      status: 401,
      code: "otp_invalid",
    });

    const { cookie: otherCookie } = await loginWeb(api, sent, otherPhone);
    const otherHeaders = {
      ...originHeaders,
      cookie: "__Host-session=" + otherCookie.value,
    };
    const otherProfile = await api.inject({ url: "/v1/me/identifiers", headers: otherHeaders });
    expect(otherProfile.json()).toMatchObject({ phone: otherPhone, email: null });
    const { sessionId: otherSessionId } = otherProfile.json<{ sessionId: string }>();
    const otherEmail = "other-linked@example.test";
    const otherChallenge = await api.inject({
      method: "POST",
      url: "/v1/me/identifiers/challenge",
      headers: { ...commandHeaders, ...otherHeaders, "x-expected-session-id": otherSessionId },
      remoteAddress: "192.0.2.43",
      payload: { email: otherEmail, locale: "ar" },
    });
    expect(otherChallenge.statusCode).toBe(202);
    const { challengeId: otherChallengeId } = requestOtpOutput.parse(otherChallenge.json());
    expect(otherChallengeId).not.toBe(challengeId);
    expect(emails.get(otherChallengeId)?.email).toBe(otherEmail);
    expect(
      await database.get().sql`
        SELECT otp.binding_session_id, users.phone_e164
        FROM public.otp_challenges AS otp
        JOIN public.users ON users.id = otp.binding_user_id
        WHERE otp.id = ${otherChallengeId}
      `,
    ).toEqual([{ binding_session_id: otherSessionId, phone_e164: otherPhone }]);

    const foreignAttempt = await api.inject({
      method: "PUT",
      url: "/v1/me/identifiers",
      headers: {
        ...otherHeaders,
        "x-expected-session-id": otherProfile.json<{ sessionId: string }>().sessionId,
        "idempotency-key": randomUUIDv7(),
      },
      payload: { challengeId, code: message.code },
    });
    expect(problemResponseSchema.parse(foreignAttempt.json())).toMatchObject({
      status: 401,
      code: "otp_invalid",
    });
    const unchanged = await database.get().sql`
      SELECT phone_e164, email FROM public.users
      WHERE phone_e164 = ANY(${[phone, otherPhone]}) ORDER BY phone_e164
    `;
    expect([...unchanged]).toEqual([
      { phone_e164: phone, email: null },
      { phone_e164: otherPhone, email: null },
    ]);

    const confirm = await api.inject({
      method: "PUT",
      url: "/v1/me/identifiers",
      headers: { ...commandHeaders, "idempotency-key": randomUUIDv7() },
      payload: { challengeId, code: message.code },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toEqual({ ...profile, email });
    const rows = await database.get().sql`
      SELECT phone_e164, email FROM public.users
      WHERE phone_e164 = ANY(${[phone, otherPhone]}) ORDER BY phone_e164
    `;
    expect([...rows]).toEqual([
      { phone_e164: phone, email },
      { phone_e164: otherPhone, email: null },
    ]);
  } finally {
    await api.close();
  }
});
