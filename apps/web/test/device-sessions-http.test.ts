import { afterEach, expect, test, vi } from "vitest";
import { listDevices, revokeDevice, signOutDevices } from "../src/auth/device-sessions-http";
import { prepareLogoutAttempt } from "../src/auth/use-device-sessions";

const id = "019d6abc-1234-7234-8234-123456789abc";
const device = {
  id,
  current: true,
  deviceName: "Safari",
  createdAt: "2026-11-06T23:30:00.000Z",
  lastSeenAt: "2026-11-07T13:00:00.000Z",
  expiresAt: "2026-11-08T00:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

test("[AUTH-03] the device list requests the strict same-origin session payload without caching", async () => {
  const response = { sessions: [device] };
  const fetch = vi.fn().mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;

  await expect(listDevices(signal)).resolves.toEqual({ kind: "ready", ...response });
  expect(fetch).toHaveBeenCalledWith("/v1/me/sessions", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
});

test("[AUTH-03] device-list errors never expose or retain malformed responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ sessions: [{ ...device, token: "unexpected" }] }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError("Offline")),
  );
  const signal = new AbortController().signal;

  await expect(listDevices(signal)).resolves.toEqual({ kind: "load-error" });
  await expect(listDevices(signal)).resolves.toEqual({ kind: "unauthenticated" });
  await expect(listDevices(signal)).resolves.toEqual({ kind: "load-error" });
  await expect(listDevices(signal)).resolves.toEqual({ kind: "load-error" });
});

test("[AUTH-03] device revocation accepts UUIDs and can reconcile a device already removed", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetch);

  await expect(revokeDevice("../sessions")).resolves.toBe("error");
  expect(fetch).not.toHaveBeenCalled();
  await expect(revokeDevice(id)).resolves.toBe("success");
  await expect(revokeDevice(id)).resolves.toBe("missing");
  expect(fetch).toHaveBeenCalledWith(`/v1/me/sessions/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  });
});

test.each(["current", "all"] as const)(
  "[AUTH-03] signs out scope %s with cookie credentials and an idempotency header",
  async (scope) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      signOutDevices({ scope, expectedSessionId: id, idempotencyKey: "first-attempt" }),
    ).resolves.toBe("success");
    expect(fetch).toHaveBeenCalledWith("/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "first-attempt" },
      body: JSON.stringify({ scope, expectedSessionId: id }),
    });
  },
);

test("[AUTH-04] an expired cookie and a rejected CSRF request produce distinct outcomes", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 })),
  );

  await expect(revokeDevice(id)).resolves.toBe("unauthenticated");
  await expect(
    signOutDevices({ scope: "all", expectedSessionId: id, idempotencyKey: "first-attempt" }),
  ).resolves.toBe("error");
});

test("[AUTH-03] sign-out exposes a changed browser session as a stale view", async () => {
  const problem = {
    type: "about:blank",
    title: "Conflict",
    status: 409,
    code: "session_changed",
    requestId: "test-logout",
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(problem, { status: 409 })));

  await expect(
    signOutDevices({ scope: "all", expectedSessionId: id, idempotencyKey: "first-attempt" }),
  ).resolves.toBe("session-changed");
});

test("[AUTH-03] unrelated and malformed logout conflicts stay ordinary failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            code: "idempotency_conflict",
            requestId: "test-logout",
          },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ code: "session_changed" }, { status: 409 }))
      .mockResolvedValueOnce(new Response("Invalid JSON", { status: 409 })),
  );
  const attempt = { scope: "all", expectedSessionId: id, idempotencyKey: "first-attempt" } as const;

  for (let retry = 0; retry < 3; retry++) {
    await expect(signOutDevices(attempt)).resolves.toBe("error");
  }
});

test("[AUTH-03] a sign-out command needs the device list to identify the current session", () => {
  expect(prepareLogoutAttempt({ sessions: [], scope: "all" })).toBeUndefined();
  expect(
    prepareLogoutAttempt({ sessions: [{ ...device, current: false }], scope: "current" }),
  ).toBeUndefined();
});

test("[AUTH-03] logout retries retain their key only for the same device and scope", () => {
  const attempt = prepareLogoutAttempt({ sessions: [device], scope: "all" });
  expect(attempt).toMatchObject({ scope: "all", expectedSessionId: id });
  expect(prepareLogoutAttempt({ sessions: [device], scope: "all", previous: attempt })).toBe(
    attempt,
  );
  const otherScope = prepareLogoutAttempt({
    sessions: [device],
    scope: "current",
    previous: attempt,
  });
  expect(otherScope).toMatchObject({ scope: "current", expectedSessionId: id });
  expect(otherScope?.idempotencyKey).not.toBe(attempt?.idempotencyKey);

  const replacementId = "019d6abc-1234-7234-8234-123456789def";
  const replacement = prepareLogoutAttempt({
    sessions: [{ ...device, id: replacementId }],
    scope: "all",
    previous: attempt,
  });
  expect(replacement?.expectedSessionId).toBe(replacementId);
  expect(replacement?.idempotencyKey).not.toBe(attempt?.idempotencyKey);
});
