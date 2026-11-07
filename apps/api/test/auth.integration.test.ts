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
    async listen(app) {
      await app.ready();
      return "http://127.0.0.1:3002";
    },
  });
  return {
    api,
    sent,
    attempts,
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
  const { api, sent } = await openAuthApi();
  try {
    const { challenge, code, response, cookie } = await loginWeb(api, sent, "+213500000010");
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
    const listed = await api.inject({ url: "/v1/me/sessions", headers: cookieHeader });
    expect(sessionListOutput.parse(listed.json()).sessions).toMatchObject([{ current: true }]);
    const logout = await api.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { ...originHeaders, ...cookieHeader, "idempotency-key": randomUUIDv7() },
      payload: { scope: "all" },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.cookies).toMatchObject([{ name: "__Host-session", maxAge: 0 }]);
    expect((await api.inject({ url: "/v1/me/sessions", headers: cookieHeader })).statusCode).toBe(
      401,
    );
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
    const response = await api.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        ...cookieHeader,
        origin: "https://other.test",
        "sec-fetch-site": "cross-site",
        "idempotency-key": randomUUIDv7(),
      },
      payload: { scope: "all" },
    });
    expect(response.statusCode).toBe(403);
    expect((await api.inject({ url: "/v1/me/sessions", headers: cookieHeader })).statusCode).toBe(
      200,
    );
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
    runtime.advance(300_000);
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
