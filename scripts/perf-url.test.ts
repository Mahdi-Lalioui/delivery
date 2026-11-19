import assert from "node:assert/strict";
import { test } from "node:test";
import { mayIgnoreLocalCertificateErrors, readPerfRestaurantSlug } from "./perf-url.ts";

void test("the performance harness ignores TLS errors only for local HTTPS origins", () => {
  assert.equal(mayIgnoreLocalCertificateErrors("https://awid.localhost:18544"), true);
  assert.equal(mayIgnoreLocalCertificateErrors("https://127.0.0.1:18544"), true);
  assert.equal(mayIgnoreLocalCertificateErrors("https://awid.example.com"), false);
  assert.equal(mayIgnoreLocalCertificateErrors("http://awid.localhost:3000"), false);
});

void test("the performance harness accepts only safe restaurant slugs", () => {
  assert.equal(readPerfRestaurantSlug(undefined), "atelier-sidi-yahia");
  assert.equal(readPerfRestaurantSlug("demo-lune-de-semoule"), "demo-lune-de-semoule");
  assert.throws(() => readPerfRestaurantSlug("../admin"), /restaurant slug/u);
});
