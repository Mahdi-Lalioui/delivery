import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readWorkerEnvironment } from "../src/command.ts";

const databaseUrl = "postgres://worker@127.0.0.1:5432/zaafran";

test("[MER-14:worker] media settings default to the shared temp root and a 50 MP bound", () => {
  expect(readWorkerEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
    DATABASE_URL: databaseUrl,
    MEDIA_STORAGE_ROOT: join(tmpdir(), "zaafran-media"),
    MEDIA_MAX_DECODED_PIXELS: 50_000_000,
  });
  expect(
    readWorkerEnvironment({
      DATABASE_URL: databaseUrl,
      MEDIA_STORAGE_ROOT: "/var/zaafran/media",
      MEDIA_MAX_DECODED_PIXELS: "24000000",
    }),
  ).toMatchObject({
    MEDIA_STORAGE_ROOT: "/var/zaafran/media",
    MEDIA_MAX_DECODED_PIXELS: 24_000_000,
  });
});

test("[MER-14:worker] invalid media settings stop the worker at startup", () => {
  for (const invalid of [
    { MEDIA_STORAGE_ROOT: "relative/media" },
    { MEDIA_MAX_DECODED_PIXELS: "0" },
    { MEDIA_MAX_DECODED_PIXELS: "1.5" },
    { MEDIA_MAX_DECODED_PIXELS: "100000001" },
    { MEDIA_MAX_DECODED_PIXELS: "many" },
  ]) {
    expect(readWorkerEnvironment({ DATABASE_URL: databaseUrl, ...invalid })).toBeUndefined();
  }
  expect(
    readWorkerEnvironment({ DATABASE_URL: "mysql://worker@127.0.0.1/zaafran" }),
  ).toBeUndefined();
});
