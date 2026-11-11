import { expect, test } from "vitest";
import { adminOrderDetailOutput, adminOrderSearchInput } from "../src/admin-orders.ts";

const uuid = "01932f18-3150-7c33-8a7a-53acfd343001";

test("[ADM-05] starts with a bounded live queue and accepts a precise cursor", () => {
  expect(adminOrderSearchInput.parse({})).toEqual({ scope: "live", limit: 20 });
  expect(
    adminOrderSearchInput.safeParse({
      scope: "all",
      cursor: { orderId: uuid, placedAt: "2026-11-11T12:03:01.000123Z" },
      filter: { kind: "code", code: "AWD-2A2" },
    }).success,
  ).toBe(true);
  expect(adminOrderSearchInput.safeParse({ limit: 51 }).success).toBe(false);
});

test("[ADM-05] accepts an exact phone or a bounded restaurant name, not loose contact data", () => {
  expect(
    adminOrderSearchInput.safeParse({ filter: { kind: "phone", phone: "+213550000000" } }).success,
  ).toBe(true);
  expect(
    adminOrderSearchInput.safeParse({ filter: { kind: "phone", phone: "0550000000" } }).success,
  ).toBe(false);
  expect(
    adminOrderSearchInput.safeParse({ filter: { kind: "restaurant", name: "  Table AWID  " } })
      .data,
  ).toMatchObject({ filter: { name: "Table AWID" } });
  expect(
    adminOrderSearchInput.safeParse({ filter: { kind: "restaurant", name: "\0unsafe" } }).success,
  ).toBe(false);
});

test("[ADM-05] the timeline does not accept customer or courier contact fields", () => {
  const event = adminOrderDetailOutput.shape.events.element;
  const sample = {
    version: 3,
    from: "accepted",
    to: "cancelled",
    actor: "admin",
    reason: "Synthetic support request",
    at: "2026-11-11T12:03:01Z",
  };
  expect(event.safeParse(sample).success).toBe(true);
  expect(event.safeParse({ ...sample, phone: "+213550000000" }).success).toBe(false);
});
