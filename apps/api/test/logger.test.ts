import { Writable } from "node:stream";
import { expect, test } from "vitest";
import { createLogger } from "../src/logger.ts";

function captureLogger() {
  const lines: string[] = [];
  const logger = createLogger(
    new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    }),
  );
  return {
    logger,
    read: () => {
      const output = lines.join("");
      const record: unknown = JSON.parse(output);
      return { output, record };
    },
  };
}

test("[M0-6] redacts nested personal fields and string addresses", () => {
  const { logger, read } = captureLogger();
  const fixture = {
    requestId: "synthetic-request",
    orderId: "synthetic-order",
    merchantId: "synthetic-merchant",
    address: "fixture-hidden-street",
    order: { customer: { name: "Synthetic customer", phone: "fixture-hidden-phone" } },
    customer: { address: { line1: "fixture-hidden-line" }, state: "verified" },
  };

  logger.info(fixture, "Synthetic order event");

  const { output, record } = read();
  expect(record).toMatchObject({
    requestId: fixture.requestId,
    orderId: fixture.orderId,
    merchantId: fixture.merchantId,
    order: { customer: { name: "Synthetic customer" } },
    customer: { state: "verified" },
    msg: "Synthetic order event",
  });
  expect(output).not.toMatch(/"(?:phone|address)"\s*:/);
  expect(output).not.toContain("fixture-hidden");
  expect(fixture.order.customer.phone).toBe("fixture-hidden-phone");
});

test("[M0-6] redacts personal fields in arrays, cycles, and child bindings", () => {
  const { logger, read } = captureLogger();
  interface CircularEvent {
    status: string;
    token: string;
    location: { label: string };
    self?: CircularEvent;
  }
  const circular: CircularEvent = {
    status: "scheduled",
    token: "fixture-hidden-token",
    location: { label: "fixture-hidden-location" },
  };
  circular.self = circular;

  logger
    .child({ requestId: "child-request", context: { nested: { code: "fixture-hidden-code" } } })
    .info({ events: [circular, { address: "fixture-hidden-array-address", count: 2 }, null] });

  const { output, record } = read();
  expect(record).toMatchObject({
    requestId: "child-request",
    events: [{ status: "scheduled", self: "[Circular]" }, { count: 2 }, null],
  });
  expect(output).not.toMatch(/"(?:address|code|location|token)"\s*:/);
  expect(output).not.toContain("fixture-hidden");
});

test("[M0-6] redacts after error serialization and custom JSON conversion", () => {
  const { logger, read } = captureLogger();
  const err = Object.assign(new Error("Synthetic failure"), {
    details: {
      context: { token: "fixture-hidden-error-token", operation: "fixture-operation" },
    },
  });
  const details = {
    toJSON() {
      return { nested: { phone: "fixture-hidden-converted-phone", status: "received" } };
    },
  };

  logger.error({ err, details }, "Synthetic handler failure");

  const { output, record } = read();
  expect(record).toMatchObject({
    err: {
      type: "Error",
      message: "Synthetic failure",
      details: { context: { operation: "fixture-operation" } },
    },
    details: { nested: { status: "received" } },
    msg: "Synthetic handler failure",
  });
  expect(record).toHaveProperty("err.stack", expect.stringContaining("Error: Synthetic failure"));
  expect(output).not.toMatch(/"(?:phone|token)"\s*:/);
  expect(output).not.toContain("fixture-hidden");
});

test("[M0-6] removes personal fields from shadowed child bindings in raw output", () => {
  const { logger, read } = captureLogger();
  logger
    .child({
      requestId: "shadowed-request",
      context: { nested: { phone: "fixture-hidden-shadow" } },
    })
    .info({ context: { status: "ok" } });

  const { output, record } = read();
  expect(record).toMatchObject({ requestId: "shadowed-request", context: { status: "ok" } });
  expect(output).not.toContain("fixture-hidden-shadow");
});
