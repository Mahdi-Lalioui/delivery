import { expect, test } from "vitest";
import { assertTestAdminUrl } from "./safety.ts";

test.each([
  "postgresql://zaafran:zaafran_dev_only@127.0.0.1:5432/zaafran_test",
  "postgres://localhost:5432/zaafran_test",
  "postgresql://[::1]:5432/zaafran_test",
])("[M0-5] accepts the test database at %s", (url) => {
  expect(assertTestAdminUrl(url).href).toBe(url);
});

test.each([
  ["invalid URL", "not a URL"],
  ["wrong protocol", "https://127.0.0.1:5432/zaafran_test"],
  ["remote host", "postgresql://db.example.com:5432/zaafran_test"],
  ["host without a loopback address", "postgresql://0.0.0.0:5432/zaafran_test"],
  ["wrong database", "postgresql://127.0.0.1:5432/zaafran"],
  ["test database lookalike", "postgresql://127.0.0.1:5432/zaafran_test_copy"],
  ["connection options", "postgresql://127.0.0.1:5432/zaafran_test?host=db.example.com"],
  ["fragment", "postgresql://127.0.0.1:5432/zaafran_test#fragment"],
])("[M0-5] rejects a test administrator URL with %s", (_, url) => {
  expect(() => assertTestAdminUrl(url)).toThrow();
});
