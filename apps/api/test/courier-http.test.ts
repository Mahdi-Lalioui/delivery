import type { createCourierRepository } from "@zaafran/db/couriers";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

const merchantId = "01932f18-3150-7c33-8a7a-53acfd343001";
const accountId = "01932f18-3150-7c33-8a7a-53acfd343002";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343003";
const inviteId = "01932f18-3150-7c33-8a7a-53acfd343004";
const courierId = "01932f18-3150-7c33-8a7a-53acfd343005";
const phone = "+213500000021";
const now = new Date("2026-11-11T10:00:00Z");
const expiresAt = "2026-11-18T10:00:00.000Z";
const rosterPath = "/v1/merchants/" + merchantId + "/couriers";

test("[COU-01:http] invites and accepts using the signed-in standard session", async () => {
  const invite = vi
    .fn<ReturnType<typeof createCourierRepository>["invite"]>()
    .mockResolvedValueOnce({ kind: "invited", invite: { inviteId, expiresAt } })
    .mockResolvedValueOnce({ kind: "not_found" })
    .mockResolvedValueOnce({ kind: "courier_already_registered" });
  const accept = vi
    .fn<ReturnType<typeof createCourierRepository>["accept"]>()
    .mockResolvedValueOnce({ kind: "accepted", courier: { courierId, merchantId } })
    .mockResolvedValueOnce({ kind: "invite_expired" });
  const list = vi
    .fn<ReturnType<typeof createCourierRepository>["list"]>()
    .mockResolvedValueOnce([{ courierId, online: true, displayName: "Sami" }])
    .mockResolvedValueOnce(undefined);
  const setPresence = vi
    .fn<ReturnType<typeof createCourierRepository>["setPresence"]>()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const jobs = vi
    .fn<ReturnType<typeof createCourierRepository>["jobs"]>()
    .mockResolvedValueOnce({ courierId, merchantId, online: true, jobs: [] })
    .mockResolvedValueOnce(undefined);
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId, sessionId }),
    couriers: { repository: { invite, accept, list, setPresence, jobs }, now: () => now },
  });
  onTestFinished(() => api.close());
  const send = (url: string, payload: object) => api.inject({ method: "POST", url, payload });
  const issued = await send(rosterPath + "/invites", { phone });
  expect(issued.statusCode).toBe(201);
  expect(issued.headers["cache-control"]).toBe("no-store");
  expect(issued.json()).toEqual({ inviteId, expiresAt });
  expect(invite).toHaveBeenCalledWith({ merchantId, phone, userId: accountId, sessionId, now });
  expect((await send(rosterPath + "/invites", { phone })).statusCode).toBe(404);
  expect((await send(rosterPath + "/invites", { phone })).statusCode).toBe(409);

  const accepted = await send("/v1/courier/invites/accept", { inviteId, displayName: " Sami " });
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json()).toEqual({ courierId, merchantId });
  expect(accept).toHaveBeenCalledWith({
    inviteId,
    displayName: "Sami",
    userId: accountId,
    sessionId,
    now,
  });
  const expired = await send("/v1/courier/invites/accept", { inviteId });
  expect(expired.statusCode).toBe(409);
  expect(expired.json()).toMatchObject({ code: "invite_expired" });
  expect(
    (await send("/v1/courier/invites/accept", { inviteId, displayName: "   " })).statusCode,
  ).toBe(400);

  expect((await api.inject(rosterPath)).json()).toEqual({
    couriers: [{ courierId, online: true, displayName: "Sami" }],
  });
  expect(list).toHaveBeenCalledWith({ merchantId, userId: accountId, sessionId });
  expect((await api.inject(rosterPath)).statusCode).toBe(404);
  const active = await api.inject("/v1/courier/jobs");
  expect(active.statusCode).toBe(200);
  expect(active.headers["cache-control"]).toBe("no-store");
  expect(active.json()).toEqual({ courierId, merchantId, online: true, jobs: [] });
  expect(jobs).toHaveBeenCalledWith({ userId: accountId, sessionId });
  expect((await api.inject("/v1/courier/jobs")).statusCode).toBe(403);
  expect((await send("/v1/courier/presence", { online: true })).statusCode).toBe(204);
  expect(setPresence).toHaveBeenCalledWith({ online: true, userId: accountId, sessionId });
  expect((await send("/v1/courier/presence", { online: false })).statusCode).toBe(403);
});
