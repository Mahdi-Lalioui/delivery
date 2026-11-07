import { expect, test } from "vitest";
import { healthResponseSchema, problemResponseSchema, readyResponseSchema } from "../src/health.ts";

test("[M0-6] parses the two health contracts and rejects unexpected fields", () => {
  expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
  expect(readyResponseSchema.parse({ status: "ready" })).toEqual({ status: "ready" });
  expect(healthResponseSchema.safeParse({ status: "ok", database: "localhost" }).success).toBe(
    false,
  );
  expect(readyResponseSchema.safeParse({ status: "ok" }).success).toBe(false);
});

test("[M0-6] validates error status, stable codes and bounded request IDs", () => {
  const problem = {
    type: "about:blank",
    title: "Service Unavailable",
    status: 503,
    code: "not_ready",
    requestId: "fixture-503",
  };

  expect(problemResponseSchema.parse(problem)).toEqual(problem);
  expect(problemResponseSchema.safeParse({ ...problem, status: 200 }).success).toBe(false);
  expect(problemResponseSchema.safeParse({ ...problem, code: "Not Ready" }).success).toBe(false);
  expect(problemResponseSchema.safeParse({ ...problem, requestId: "not an id" }).success).toBe(
    false,
  );
  expect(problemResponseSchema.safeParse({ ...problem, stack: "db error" }).success).toBe(false);
});
