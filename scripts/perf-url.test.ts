import assert from "node:assert/strict";
import { test } from "node:test";
import { mayIgnoreLocalCertificateErrors } from "./perf-url.mjs";

void test("the performance harness ignores TLS errors only for local HTTPS origins", () => {
  assert.equal(mayIgnoreLocalCertificateErrors("https://awid.localhost:18544"), true);
  assert.equal(mayIgnoreLocalCertificateErrors("https://127.0.0.1:18544"), true);
  assert.equal(mayIgnoreLocalCertificateErrors("https://awid.example.com"), false);
  assert.equal(mayIgnoreLocalCertificateErrors("http://awid.localhost:3000"), false);
});
