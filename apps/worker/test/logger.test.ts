import { Writable } from "node:stream";
import { expect, test } from "vitest";
import { createWorkerLogger } from "../src/logger.js";

function isLogEntry(value: unknown): value is { readonly safe?: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("worker logs redact personal fields at every depth", () => {
  const lines: string[] = [];
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const logger = createWorkerLogger(output);

  logger.info(
    {
      order: { customer: { phone: "+213555111222", email: "customer@example.test" } },
      customer: { address: { line1: "12 Test Street" } },
      address: "Near the blue pharmacy",
      safe: "retained",
    },
    "fixture order",
  );

  const parsed: unknown = JSON.parse(lines.join(""));
  if (!isLogEntry(parsed)) throw new Error("Expected worker log object");
  const entry = parsed;
  const serialized = JSON.stringify(entry);
  expect(serialized).not.toContain("+213555111222");
  expect(serialized).not.toContain("customer@example.test");
  expect(serialized).not.toContain("12 Test Street");
  expect(serialized).not.toContain("Near the blue pharmacy");
  expect(entry.safe).toBe("retained");
});
