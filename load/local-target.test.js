import assert from "node:assert/strict";
import { test } from "node:test";
import { requireLocalTarget } from "./local-target.js";

void test("load fixtures are sent only to the same local HTTPS origin", () => {
  const local = "https://awid.localhost:18544";
  assert.doesNotThrow(() => requireLocalTarget(local, local));
  assert.doesNotThrow(() => requireLocalTarget("https://127.0.0.1", "https://127.0.0.1"));
  for (const invalid of [
    "https://awid.example",
    "https://localhost.example",
    "https://localhost@awid.example",
    "https://localhost/other",
    "http://localhost",
  ]) {
    assert.throws(() => requireLocalTarget(invalid, invalid));
  }
  assert.throws(() => requireLocalTarget(local, "https://localhost:18544"));
});
