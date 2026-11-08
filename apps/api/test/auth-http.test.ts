import rateLimit from "@fastify/rate-limit";
import { problemResponseSchema } from "@zaafran/contracts/health";
import fastify, { type FastifyError, type LightMyRequestResponse } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import { createAuthAccess } from "../src/auth-access.ts";
import { registerAuthRoutes } from "../src/auth-routes.ts";
import type { AuthService } from "../src/auth-service.ts";
import { sendProblem } from "../src/problems.ts";

const publicOrigin = "https://zaafran.test";
const challengeId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const otherSessionId = "01932f18-3150-7c33-8a7a-53acfd343003";
const userId = "01932f18-3150-7c33-8a7a-53acfd343004";
const token = "A".repeat(43);
const requestPath = "/v1/auth/otp/request";
const verifyPath = "/v1/auth/otp/verify";
const totpPath = "/v1/auth/totp/verify";
const logoutPath = "/v1/auth/logout";
const sessionsPath = "/v1/me/sessions";
const requestOtp = { phone: "+213500000000", purpose: "sign_in" } as const;
const verifyOtp = { challengeId, code: "001234", transport: "web" } as const;
const browserHeaders = { origin: publicOrigin, "sec-fetch-site": "same-origin" };
const keyHeader = { "idempotency-key": "fixture-auth-request" };
const postHeaders = { ...browserHeaders, ...keyHeader };
const webCredential = { cookie: `__Host-session=${token}` };
const bearerCredential = { authorization: `Bearer ${token}` };
const now = new Date("2026-11-07T12:00:00.000Z");
const device = {
  id: sessionId,
  createdAt: now,
  lastSeenAt: now,
  expiresAt: new Date("2026-12-07T12:00:00.000Z"),
  deviceName: "Fixture device",
};
const resolvedSession = { ...device, userId, transport: "web", kind: "standard" } as const;

function expectProblem(response: LightMyRequestResponse, status: number, code: string) {
  expect(response.statusCode).toBe(status);
  expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
  const problem = problemResponseSchema.parse(response.json());
  expect(problem).toMatchObject({ status, code });
  expect(response.headers["x-request-id"]).toBe(problem.requestId);
}

function expectWebCookie(response: LightMyRequestResponse, value: string, maxAge: number) {
  const cookies = response.headers["set-cookie"];
  const values = Array.isArray(cookies) ? cookies : cookies === undefined ? [] : [cookies];
  expect(values).toHaveLength(1);
  const fields = values[0]?.split(";").map((field) => field.trim()) ?? [];
  expect(fields[0]).toBe(`__Host-session=${value}`);
  expect(fields).toEqual(
    expect.arrayContaining([
      "Path=/",
      `Max-Age=${maxAge.toString()}`,
      "Secure",
      "HttpOnly",
      "SameSite=Lax",
    ]),
  );
  expect(fields.some((field) => /^domain=/i.test(field))).toBe(false);
}

function setup(options?: Pick<Parameters<typeof createApi>[0], "rateLimit">) {
  const service = {
    requestOtp: vi.fn<AuthService["requestOtp"]>(),
    verifyOtp: vi.fn<AuthService["verifyOtp"]>(),
    verifyTotp: vi.fn<AuthService["verifyTotp"]>(),
    resolveSession: vi.fn<AuthService["resolveSession"]>(),
    listSessions: vi.fn<AuthService["listSessions"]>(),
    revokeSessions: vi.fn<AuthService["revokeSessions"]>(),
  } satisfies AuthService;
  const api = createApi({
    ...options,
    checkReadiness: () => Promise.resolve(),
    auth: { service, publicOrigin },
  });
  onTestFinished(() => api.close());
  return { api, service };
}

test("[AUTH-01:http] OTP request returns only the accepted challenge and its timing", async () => {
  const { api, service } = setup();
  const challenge = {
    challengeId,
    expiresAt: "2026-11-07T12:05:00.000Z",
    resendAt: "2026-11-07T12:00:45.000Z",
  };
  service.requestOtp.mockResolvedValue({ ok: true, value: challenge });

  const response = await api.inject({
    method: "POST",
    url: requestPath,
    headers: postHeaders,
    payload: requestOtp,
    remoteAddress: "192.0.2.1",
  });

  expect(response.statusCode).toBe(202);
  expect(response.json()).toEqual(challenge);
  expect(response.headers["set-cookie"]).toBeUndefined();
  expect(service.requestOtp).toHaveBeenCalledExactlyOnceWith({
    ...requestOtp,
    requestIp: "192.0.2.1",
    idempotencyKey: "fixture-auth-request",
  });
});

const verificationRoutes = [
  {
    label: "OTP",
    url: verifyPath,
    method: "verifyOtp",
    expiresAt: device.expiresAt,
    maxAge: 2_592_000,
  },
  {
    label: "TOTP",
    url: totpPath,
    method: "verifyTotp",
    expiresAt: new Date("2026-11-08T00:00:00.000Z"),
    maxAge: 43_200,
  },
] as const;

const publicPosts = [
  { url: requestPath, method: "requestOtp", payload: requestOtp },
  { url: verifyPath, method: "verifyOtp", payload: verifyOtp },
  { url: totpPath, method: "verifyTotp", payload: verifyOtp },
] as const;

test.each(publicPosts)(
  "[AUTH-02:http] POST $url is throttled with route-level rate limiting",
  async ({ url, payload }) => {
    const api = fastify();
    onTestFinished(() => api.close());
    api.setValidatorCompiler(validatorCompiler);
    api.setSerializerCompiler(serializerCompiler);
    api.setErrorHandler<FastifyError>((error, _request, reply) =>
      sendProblem(reply, error.statusCode ?? 500),
    );
    await api.register(rateLimit, { global: false, max: 1, timeWindow: 60_000 });
    registerAuthRoutes(api, createAuthAccess(undefined));
    const request = { method: "POST", url, headers: postHeaders, payload } as const;

    expect((await api.inject(request)).statusCode).toBe(503);
    const limited = await api.inject(request);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toMatch(/^\d+$/);
  },
);

test("[AUTH-02:http] public auth routes share the API rate limit and count requests once", async () => {
  const { api, service } = setup({ rateLimit: { max: 2, timeWindow: 60_000 } });
  service.requestOtp.mockResolvedValue({
    ok: true,
    value: {
      challengeId,
      expiresAt: "2026-11-07T12:05:00.000Z",
      resendAt: "2026-11-07T12:00:45.000Z",
    },
  });
  service.verifyOtp.mockResolvedValue({ ok: false, code: "otp_invalid" });
  const remoteAddress = "192.0.2.1";
  const request = { method: "POST", headers: postHeaders, remoteAddress } as const;

  const accepted = await api.inject({ ...request, url: requestPath, payload: requestOtp });
  expect(accepted.statusCode).toBe(202);
  expect(accepted.headers["x-ratelimit-remaining"]).toBe("1");
  const attempted = await api.inject({ ...request, url: verifyPath, payload: verifyOtp });
  expectProblem(attempted, 401, "otp_invalid");
  expect(attempted.headers["x-ratelimit-remaining"]).toBe("0");
  const limited = await api.inject({ ...request, url: totpPath, payload: verifyOtp });
  expectProblem(limited, 429, "rate_limited");
  expect(limited.headers["retry-after"]).toMatch(/^\d+$/);
  expect(service.verifyTotp).not.toHaveBeenCalled();
});

test.each([
  ...publicPosts,
  {
    url: logoutPath,
    method: "revokeSessions",
    payload: { scope: "current", expectedSessionId: sessionId },
  } as const,
])(
  "[AUTH-01:http] POST $url requires a valid idempotency key",
  async ({ url, method, payload }) => {
    const { api, service } = setup();
    service.resolveSession.mockResolvedValue(resolvedSession);
    const credential = url === logoutPath ? webCredential : {};

    for (const key of [{}, { "idempotency-key": "invalid key" }]) {
      const response = await api.inject({
        method: "POST",
        url,
        payload,
        headers: { ...browserHeaders, ...credential, ...key },
      });
      expectProblem(response, 400, "invalid_request");
    }
    expect(service[method]).not.toHaveBeenCalled();
  },
);

test.each(publicPosts)(
  "[AUTH-04:http] POST $url rejects a browser from another origin",
  async ({ url, method, payload }) => {
    const { api, service } = setup();
    const response = await api.inject({
      method: "POST",
      url,
      payload,
      headers: {
        ...postHeaders,
        origin: "https://other.zaafran.test",
        "sec-fetch-site": "same-site",
      },
    });

    expectProblem(response, 403, "forbidden");
    expect(service[method]).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeUndefined();
  },
);

test.each(verificationRoutes)(
  "[AUTH-03:http] $label web verification issues one secure cookie and no token in JSON",
  async ({ url, method, expiresAt, maxAge }) => {
    const { api, service } = setup();
    service[method].mockResolvedValue({
      ok: true,
      value: { kind: "session", transport: "web", token, now, session: { ...device, expiresAt } },
    });

    const response = await api.inject({
      method: "POST",
      url,
      headers: postHeaders,
      payload: verifyOtp,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "authenticated", transport: "web" });
    expectWebCookie(response, token, maxAge);
    expect(service[method]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(verifyOtp));
  },
);

test.each(verificationRoutes)(
  "[AUTH-03:http] $label returns a native bearer credential only without browser metadata",
  async ({ url, method }) => {
    const { api, service } = setup();
    service[method].mockResolvedValue({
      ok: true,
      value: { kind: "session", transport: "bearer", token, now, session: device },
    });
    const payload = { ...verifyOtp, transport: "bearer" };

    for (const browserMetadata of [{ origin: publicOrigin }, { "sec-fetch-site": "same-origin" }]) {
      const response = await api.inject({
        method: "POST",
        url,
        payload,
        headers: { ...keyHeader, ...browserMetadata },
      });
      expectProblem(response, 403, "forbidden");
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.body).not.toContain(token);
    }
    expect(service[method]).not.toHaveBeenCalled();

    const native = await api.inject({ method: "POST", url, headers: keyHeader, payload });
    expect(native.statusCode).toBe(200);
    expect(native.json()).toEqual({ status: "authenticated", transport: "bearer", token });
    expect(native.headers["set-cookie"]).toBeUndefined();
    expect(service[method]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(payload));
  },
);

test("[AUTH-05:http] an admin OTP response supplies the TOTP challenge without a credential", async () => {
  const { api, service } = setup();
  const pendingId = "01932f18-3150-7c33-8a7a-53acfd343005";
  service.verifyOtp.mockResolvedValue({
    ok: true,
    value: { kind: "totp_required", challengeId: pendingId },
  });

  const response = await api.inject({
    method: "POST",
    url: verifyPath,
    headers: postHeaders,
    payload: verifyOtp,
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    status: "totp_required",
    challengeId: pendingId,
    expiresInSeconds: 300,
  });
  expect(response.headers["set-cookie"]).toBeUndefined();
  expect(service.verifyTotp).not.toHaveBeenCalled();
});

test.each([
  ["verifyOtp", "otp_invalid", 401],
  ["verifyOtp", "otp_expired", 410],
  ["verifyOtp", "otp_locked", 429],
  ["verifyOtp", "otp_consumed", 409],
  ["verifyTotp", "totp_invalid", 401],
  ["verifyTotp", "totp_expired", 410],
  ["verifyTotp", "totp_locked", 429],
  ["verifyTotp", "totp_consumed", 409],
  ["verifyTotp", "totp_replayed", 409],
] as const)(
  "[AUTH-01:http] [AUTH-05:http] %s returns %s with HTTP %i",
  async (method, code, status) => {
    const { api, service } = setup();
    service[method].mockResolvedValue({ ok: false, code });
    const url = method === "verifyOtp" ? verifyPath : totpPath;
    const response = await api.inject({
      method: "POST",
      url,
      headers: postHeaders,
      payload: verifyOtp,
    });

    expectProblem(response, status, code);
    expect(response.headers["set-cookie"]).toBeUndefined();
  },
);

test("[AUTH-02:http] a throttled OTP request reports Retry-After and an idempotency conflict reports 409", async () => {
  const { api, service } = setup();
  service.requestOtp
    .mockResolvedValueOnce({ ok: false, code: "otp_rate_limited", retryAfterSeconds: 19 })
    .mockResolvedValueOnce({ ok: false, code: "idempotency_conflict" });
  const request = {
    method: "POST",
    url: requestPath,
    headers: postHeaders,
    payload: requestOtp,
  } as const;

  const limited = await api.inject(request);
  expectProblem(limited, 429, "otp_rate_limited");
  expect(limited.headers["retry-after"]).toBe("19");

  const conflict = await api.inject(request);
  expectProblem(conflict, 409, "idempotency_conflict");
});

test("[AUTH-02:http] a failed SMS delivery reports a retryable service failure", async () => {
  const { api, service } = setup();
  service.requestOtp.mockResolvedValue({ ok: false, code: "otp_delivery_unavailable" });
  const response = await api.inject({
    method: "POST",
    url: requestPath,
    headers: postHeaders,
    payload: requestOtp,
  });

  expectProblem(response, 503, "otp_delivery_unavailable");
  expect(response.headers["set-cookie"]).toBeUndefined();
});

test.each([
  ["web", "standard", webCredential],
  ["bearer", "standard", bearerCredential],
  ["web", "admin", webCredential],
] as const)(
  "[AUTH-03:http] device list resolves the %s credential for a %s session",
  async (transport, kind, headers) => {
    const { api, service } = setup();
    const session = { ...resolvedSession, transport, kind };
    service.resolveSession.mockResolvedValue(session);
    const listing = {
      sessions: [
        {
          id: sessionId,
          current: true,
          deviceName: device.deviceName,
          createdAt: device.createdAt.toISOString(),
          lastSeenAt: device.lastSeenAt.toISOString(),
          expiresAt: device.expiresAt.toISOString(),
        },
      ],
    };
    service.listSessions.mockResolvedValue(listing);

    const response = await api.inject({ method: "GET", url: sessionsPath, headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(listing);
    expect(service.resolveSession).toHaveBeenCalledExactlyOnceWith({ token, transport });
    expect(service.listSessions).toHaveBeenCalledExactlyOnceWith(session);
  },
);

test("[AUTH-03:http] a request without a unique credential cannot read device sessions", async () => {
  const { api, service } = setup();
  for (const headers of [{}, { ...webCredential, ...bearerCredential }]) {
    const response = await api.inject({ method: "GET", url: sessionsPath, headers });
    expectProblem(response, 401, "unauthenticated");
  }
  expect(service.resolveSession).not.toHaveBeenCalled();
  expect(service.listSessions).not.toHaveBeenCalled();
});

test("[AUTH-04:http] cross-site cookie logout and revocation cannot resolve or mutate a session", async () => {
  const { api, service } = setup();
  service.resolveSession.mockResolvedValue(resolvedSession);
  const headers = { ...postHeaders, ...webCredential, "sec-fetch-site": "cross-site" };
  const logout = await api.inject({
    method: "POST",
    url: logoutPath,
    headers,
    payload: { scope: "all", expectedSessionId: sessionId },
  });
  const revoke = await api.inject({
    method: "DELETE",
    url: `${sessionsPath}/${otherSessionId}`,
    headers,
  });

  expectProblem(logout, 403, "forbidden");
  expectProblem(revoke, 403, "forbidden");
  expect(service.resolveSession).not.toHaveBeenCalled();
  expect(service.revokeSessions).not.toHaveBeenCalled();
  expect(logout.headers["set-cookie"]).toBeUndefined();
  expect(revoke.headers["set-cookie"]).toBeUndefined();
});

test("[AUTH-03:http] revoking a session uses the authenticated owner and hides a foreign ID", async () => {
  const { api, service } = setup();
  service.resolveSession.mockResolvedValue(resolvedSession);
  service.revokeSessions.mockResolvedValue(0);
  const response = await api.inject({
    method: "DELETE",
    url: `${sessionsPath}/${otherSessionId}`,
    headers: { ...browserHeaders, ...webCredential },
  });

  expectProblem(response, 404, "not_found");
  expect(service.revokeSessions).toHaveBeenCalledExactlyOnceWith(resolvedSession, {
    kind: "one",
    sessionId: otherSessionId,
  });
  expect(response.headers["set-cookie"]).toBeUndefined();
});

test.each([
  ["current", { kind: "one", sessionId }],
  ["all", { kind: "all" }],
] as const)(
  "[AUTH-03:http] logout scope %s returns 204 and clears the web cookie once",
  async (scope, expected) => {
    const { api, service } = setup();
    service.resolveSession.mockResolvedValue(resolvedSession);
    service.revokeSessions.mockResolvedValue(1);
    const response = await api.inject({
      method: "POST",
      url: logoutPath,
      headers: { ...postHeaders, ...webCredential },
      payload: { scope, expectedSessionId: sessionId },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expectWebCookie(response, "", 0);
    expect(service.revokeSessions).toHaveBeenCalledExactlyOnceWith(resolvedSession, expected);
  },
);

test("[AUTH-03:http] native logout revokes the bearer session without setting a cookie", async () => {
  const { api, service } = setup();
  const session = { ...resolvedSession, transport: "bearer" } as const;
  service.resolveSession.mockResolvedValue(session);
  service.revokeSessions.mockResolvedValue(1);
  const response = await api.inject({
    method: "POST",
    url: logoutPath,
    headers: { ...keyHeader, ...bearerCredential },
    payload: { scope: "current", expectedSessionId: sessionId },
  });

  expect(response.statusCode).toBe(204);
  expect(response.body).toBe("");
  expect(response.headers["set-cookie"]).toBeUndefined();
  expect(service.revokeSessions).toHaveBeenCalledExactlyOnceWith(session, {
    kind: "one",
    sessionId,
  });
});

test("[AUTH-03:http] refuses to sign out a session that changed since the device list loaded", async () => {
  const { api, service } = setup();
  service.resolveSession.mockResolvedValue(resolvedSession);
  const response = await api.inject({
    method: "POST",
    url: logoutPath,
    headers: { ...postHeaders, ...webCredential },
    payload: { scope: "all", expectedSessionId: otherSessionId },
  });
  expectProblem(response, 409, "session_changed");
  expect(service.revokeSessions).not.toHaveBeenCalled();
  expect(response.headers["set-cookie"]).toBeUndefined();
});
