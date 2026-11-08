import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { countdownParts, groupSlotsByDay, loadSlots } from "../src/retention/scheduling";

const merchantId = "019d6abc-0000-7000-8000-000000000002";
const addressId = "019d6abc-0000-7000-8000-000000000301";
const server = setupServer();
let lastQuery: URLSearchParams | undefined;

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  lastQuery = undefined;
  server.resetHandlers(
    http.get("*/v1/slots", ({ request }) => {
      lastQuery = new URL(request.url).searchParams;
      return HttpResponse.json({
        fulfilment: "delivery",
        slots: [
          { kind: "iftar", scheduledFor: "2027-02-10T18:05:00+01:00" },
          { kind: "scheduled", scheduledFor: "2027-02-10T19:00:00+01:00" },
          { kind: "scheduled", scheduledFor: "2027-02-10T23:45:00+01:00" },
          { kind: "scheduled", scheduledFor: "2027-02-11T00:00:00+01:00" },
        ],
      });
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

test("[CUS-13][HRS-02] asks for delivery slots for the saved address", async () => {
  const result = await loadSlots({ fulfilment: "delivery", merchantId, addressId });
  expect(result.kind).toBe("ready");
  expect(Object.fromEntries(lastQuery ?? [])).toEqual({
    fulfilment: "delivery",
    merchantId,
    addressId,
  });
});

test("[CUS-13] rejects an answer for the wrong fulfilment", async () => {
  expect(await loadSlots({ fulfilment: "pickup", merchantId })).toEqual({ kind: "error" });
});

test("[HRS-02][HRS-03] groups slots by Algiers day and pulls the Iftar slot out first", async () => {
  const result = await loadSlots({ fulfilment: "delivery", merchantId, addressId });
  if (result.kind !== "ready") throw new Error("expected ready");
  const grouped = groupSlotsByDay(result.slots);
  expect(grouped.iftar?.scheduledFor).toBe("2027-02-10T18:05:00+01:00");
  expect(grouped.days.map((day) => [day.date, day.slots.length])).toEqual([
    ["2027-02-10", 2],
    ["2027-02-11", 1],
  ]);
});

test("[HRS-03] splits the countdown to Maghrib into hours, minutes and seconds", () => {
  const maghribAt = Date.parse("2027-02-10T18:10:00+01:00");
  expect(countdownParts({ now: maghribAt - 3_723_000, maghribAt })).toEqual({
    hours: 1,
    minutes: 2,
    seconds: 3,
  });
  expect(countdownParts({ now: maghribAt + 1_000, maghribAt })).toEqual({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  expect(countdownParts({ now: Number.NaN, maghribAt })).toBeUndefined();
});
