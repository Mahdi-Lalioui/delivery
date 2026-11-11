import { customerPrivacyDeleteInput } from "@zaafran/contracts/retention";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  confirmDeletion,
  exportFile,
  exportMyData,
  normalizeCode,
  requestDeletionCode,
} from "../src/retention/privacy/privacy-http";

const accountId = "019d6abc-0000-7000-8000-000000000801";
const challengeId = "019d6abc-0000-7000-8000-000000000802";
const exported = {
  profile: { accountId, phoneE164: "+213555123456" },
  addresses: [],
  orders: [],
  ratings: [],
};
const server = setupServer();
let deleted = false;
let sent = 0;

function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: `https://zaafran.invalid/problems/${code}`,
      title: code,
      status,
      code,
      requestId: "mock",
    },
    { status },
  );
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  deleted = false;
  sent = 0;
  const keys = new Set<string>();
  server.resetHandlers(
    http.get("*/v1/me/export", () => HttpResponse.json(exported)),
    http.post("*/v1/me/deletion-challenge", ({ request }) => {
      const key = request.headers.get("idempotency-key") ?? "";
      if (!keys.has(key)) sent += 1;
      keys.add(key);
      return HttpResponse.json(
        { challengeId, expiresAt: "2027-02-10T18:05:00.000Z" },
        { status: 201 },
      );
    }),
    http.delete("*/v1/me", async ({ request }) => {
      const body = customerPrivacyDeleteInput.parse(await request.json());
      if (body.challengeId !== challengeId) return problem(409, "challenge_expired");
      if (body.code !== "123456") return problem(400, "invalid_code");
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const interceptedFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    interceptedFetch(new URL(input, "http://app.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

test("[CUS-24] exports the account data as a JSON file", async () => {
  const result = await exportMyData();
  expect(result).toEqual({ kind: "ready", data: exported });
  if (result.kind !== "ready") return;
  const file = exportFile(result.data);
  expect(file.type).toBe("application/json");
  expect(JSON.parse(await file.text())).toEqual(exported);
});

test("[CUS-24] sends one deletion code per idempotency key", async () => {
  expect(await requestDeletionCode("k1")).toEqual({ kind: "sent", challengeId });
  expect(await requestDeletionCode("k1")).toEqual({ kind: "sent", challengeId });
  expect(sent).toBe(1);
});

test("[CUS-24] deletes only with the right code and reports wrong or expired codes", async () => {
  expect(await confirmDeletion({ challengeId, code: "12345" })).toEqual({ kind: "invalid-code" });
  expect(await confirmDeletion({ challengeId, code: "654321" })).toEqual({ kind: "invalid-code" });
  expect(await confirmDeletion({ challengeId: accountId, code: "123456" })).toEqual({
    kind: "expired",
  });
  expect(deleted).toBe(false);
  expect(await confirmDeletion({ challengeId, code: " 123456 " })).toEqual({ kind: "deleted" });
  expect(deleted).toBe(true);
});

test("[CUS-24] normalises autofilled codes and reports an unanswered delete as unknown", async () => {
  expect(normalizeCode(" ١٢٣ ۴۵۶ ")).toBe("123456");
  expect(await confirmDeletion({ challengeId, code: "١٢٣٤٥٦" })).toEqual({ kind: "deleted" });
  server.use(http.delete("*/v1/me", () => HttpResponse.error()));
  expect(await confirmDeletion({ challengeId, code: "123456" })).toEqual({ kind: "unknown" });
});

test("[CUS-24] treats only a confirmed 204 as successful deletion", async () => {
  server.use(http.delete("*/v1/me", () => HttpResponse.json({ status: "unexpected" })));
  expect(await confirmDeletion({ challengeId, code: "123456" })).toEqual({ kind: "error" });
});
