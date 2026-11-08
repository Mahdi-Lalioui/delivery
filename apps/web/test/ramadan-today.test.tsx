import { http, HttpResponse, type JsonBodyType } from "msw";
import { setupServer } from "msw/node";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { RamadanBanner } from "../src/retention/ramadan-banner";
import { loadRamadanToday } from "../src/retention/scheduling";

const communeId = "019d6abc-0000-7000-8000-000000000401";
const server = setupServer();
let body: JsonBodyType = { isRamadan: true, maghribAt: "2027-02-10T17:10:00.000Z" };

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  server.resetHandlers(
    http.get("*/v1/ramadan/today", ({ request }) =>
      new URL(request.url).searchParams.get("communeId") === communeId
        ? HttpResponse.json(body)
        : new HttpResponse(null, { status: 400 }),
    ),
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

test("[HRS-03] returns today's Maghrib for the commune during Ramadan", async () => {
  expect(await loadRamadanToday(communeId)).toEqual({
    kind: "ramadan",
    maghribAt: "2027-02-10T17:10:00.000Z",
  });
});

test("[HRS-03] hides the banner outside Ramadan and on malformed or invalid input", async () => {
  body = { isRamadan: false, maghribAt: null };
  expect(await loadRamadanToday(communeId)).toEqual({ kind: "not-ramadan" });
  body = { isRamadan: true, maghribAt: null };
  expect(await loadRamadanToday(communeId)).toEqual({ kind: "error" });
  expect(await loadRamadanToday("not-a-uuid")).toEqual({ kind: "error" });
});

test("[HRS-03] the banner renders nothing until today's answer arrives", () => {
  expect(renderToStaticMarkup(<RamadanBanner communeId={communeId} />)).toBe("");
});
