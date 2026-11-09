import { Writable } from "node:stream";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { PrivacyServices } from "../src/privacy-routes.ts";

const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const challengeId = "01932f18-3150-7c33-8a7a-53acfd343003";
const payload = { challengeId, code: "012345" };
const profile = { accountId, phoneE164: "+213500000000" };

function setup(authenticated = true) {
  const privacy = {
    issue: vi.fn<PrivacyServices["issue"]>(),
    confirm: vi.fn<PrivacyServices["confirm"]>(),
    replay: vi.fn<PrivacyServices["replay"]>(),
    exportAccount: vi.fn<PrivacyServices["exportAccount"]>(),
  };
  const logs: string[] = [];
  const api = createApi({
    logStream: new Writable({
      write(chunk, _encoding, done) {
        logs.push(String(chunk));
        done();
      },
    }),
    checkReadiness: () => Promise.resolve(),
    resolveActor: () =>
      Promise.resolve(authenticated ? { role: "customer", accountId, sessionId } : undefined),
    privacy,
  });
  onTestFinished(() => api.close());
  return { api, privacy, logs };
}

test("[CUS-24:http] exports only the caller and forbids caching", async () => {
  const { api, privacy } = setup();
  privacy.exportAccount.mockResolvedValue({ profile, addresses: [], orders: [], ratings: [] });
  const response = await api.inject("/v1/me/export");
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.json()).toEqual({ profile, addresses: [], orders: [], ratings: [] });
  expect(privacy.exportAccount).toHaveBeenCalledWith({ userId: accountId, sessionId });
});

test("[CUS-24:http] requires an idempotency key, returns 201, then reports rate limits", async () => {
  const { api, privacy } = setup();
  const url = "/v1/me/deletion-challenge";
  expect((await api.inject({ method: "POST", url })).statusCode).toBe(400);
  privacy.issue
    .mockResolvedValueOnce({
      kind: "issued",
      challengeId,
      expiresAt: new Date("2026-11-09T12:30:00Z"),
    })
    .mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 45 });
  const request = { method: "POST", url, headers: { "idempotency-key": "privacy-1" } } as const;
  const first = await api.inject(request);
  expect(first.statusCode).toBe(201);
  expect(first.json()).toEqual({ challengeId, expiresAt: "2026-11-09T12:30:00.000Z" });
  const limited = await api.inject(request);
  expect(limited.statusCode).toBe(429);
  expect(limited.headers["retry-after"]).toBe("45");
});

test("[CUS-24:http] only allows replay proof on deletion and clears the cookie", async () => {
  const { api, privacy } = setup(false);
  privacy.replay.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const request = { method: "DELETE", url: "/v1/me", payload } as const;
  expect((await api.inject(request)).statusCode).toBe(401);
  const replay = await api.inject(request);
  expect(replay.statusCode).toBe(204);
  expect(replay.body).toBe("");
  expect(replay.headers["set-cookie"]).toContain("Max-Age=0");
  expect((await api.inject("/v1/me/export")).statusCode).toBe(401);
  expect(privacy.confirm).not.toHaveBeenCalled();
});

test("[CUS-24:http] maps wrong and exhausted codes without echoing the submitted OTP", async () => {
  const { api, privacy } = setup();
  privacy.confirm.mockResolvedValueOnce("invalid_code").mockResolvedValueOnce("challenge_expired");
  const request = { method: "DELETE", url: "/v1/me", payload } as const;
  const invalid = await api.inject(request);
  expect(invalid.statusCode).toBe(400);
  expect(invalid.json()).toMatchObject({ code: "invalid_code" });
  expect(invalid.body).not.toContain(payload.code);
  const exhausted = await api.inject(request);
  expect(exhausted.statusCode).toBe(409);
  expect(exhausted.json()).toMatchObject({ code: "challenge_expired" });
  expect(exhausted.body).not.toContain(payload.code);
  expect(privacy.confirm).toHaveBeenCalledWith({ userId: accountId, sessionId, ...payload });
});

test("[CUS-24:http] logs only a generic failure when a deletion repository throws", async () => {
  const { api, privacy, logs } = setup();
  privacy.confirm.mockRejectedValue(new Error(profile.phoneE164 + ":" + payload.code));
  const response = await api.inject({ method: "DELETE", url: "/v1/me", payload });
  expect(response.statusCode).toBe(500);
  const output = logs.join("");
  expect(output).toContain("Unhandled request failure");
  expect(output).not.toContain(profile.phoneE164);
  expect(output).not.toContain(payload.code);
});
