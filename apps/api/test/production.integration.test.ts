import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { discoveryLocationOutput } from "@zaafran/contracts/discovery";
import { problemResponseSchema, readyResponseSchema } from "@zaafran/contracts/health";
import { seedGeography } from "@zaafran/db/geography";
import { expect, test, vi } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";

const database = registerTestDatabase();
const runCommand = promisify(execFile);

test("[M0-6] the built production process excludes debug routes and reports unavailable jobs", async () => {
  const dist = new URL("../dist/", import.meta.url);
  const modules = await readdir(dist);
  for (const privateModule of ["test-routes.js", "dev-outbox.js", "fake-outbox.js"]) {
    expect(modules).not.toContain(privateModule);
  }
  const child = spawn(process.execPath, [fileURLToPath(new URL("server.js", dist))], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: database.url(),
      API_HOST: "127.0.0.1",
      API_PORT: "0",
      AUTH_PUBLIC_ORIGIN: "https://zaafran.test",
      AUTH_OTP_KEY: "01".repeat(32),
      AUTH_TOTP_KEY: "02".repeat(32),
    },
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  const closed = once(child, "close");

  try {
    const origin = await vi.waitFor(
      () => {
        const listenAddress = /"listenAddress":"(http:\/\/127\.0\.0\.1:\d+)"/.exec(output)?.[1];
        if (!listenAddress) throw new Error("API did not report its listener: " + output);
        return listenAddress;
      },
      { timeout: 5_000 },
    );
    expect((await fetch(new URL("/healthz", origin))).status).toBe(200);
    const readiness = await fetch(new URL("/readyz", origin));
    expect(readiness.status).toBe(503);
    expect(problemResponseSchema.parse(await readiness.json()).code).toBe("not_ready");
    const methods = await fetch(new URL("/v1/auth/methods", origin));
    expect(methods.status).toBe(200);
    expect(methods.headers.get("cache-control")).toBe("no-store");
    expect(await methods.json()).toEqual({ methods: [] });
    const authentication = await fetch(new URL("/v1/auth/otp/request", origin), {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "compiled-api-fixture" },
      body: JSON.stringify({ phone: "+213500000000", purpose: "sign_in" }),
    });
    expect(authentication.status).toBe(503);
    expect(problemResponseSchema.parse(await authentication.json()).code).toBe(
      "otp_delivery_unavailable",
    );
    await seedGeography(database.get());
    const [commune] = await database.get().sql<{ id: string }[]>`
      SELECT id FROM public.communes WHERE code = '1601'
    `;
    if (!commune) throw new Error("The seeded Algiers commune is missing.");
    const location = await fetch(new URL("/v1/geo/serviceability", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "commune", communeId: commune.id }),
    });
    expect(location.status).toBe(200);
    expect(location.headers.get("cache-control")).toBe("no-store");
    const resolved = discoveryLocationOutput.parse(await location.json());
    expect(resolved.communeId).toBe(commune.id);
    expect(resolved.serviceAreaId).not.toBeNull();

    const privateRoutes = [
      ["POST", "/__test__/clock"],
      ["POST", "/__test__/reset"],
      ["GET", "/__test__/outbox"],
      ["GET", "/__dev__/outbox"],
    ] as const;
    for (const [method, path] of privateRoutes) {
      const response = await fetch(new URL(path, origin), { method });
      expect(response.status).toBe(404);
      expect(problemResponseSchema.parse(await response.json()).code).toBe("not_found");
    }

    const migrate = fileURLToPath(new URL("../../worker/dist/migrate.js", import.meta.url));
    await runCommand(process.execPath, [migrate], {
      env: { ...process.env, DATABASE_URL: database.url() },
    });
    await database.get().sql`alter table public.job_effects rename to job_effects_hidden_fixture`;
    try {
      const incomplete = await fetch(new URL("/readyz", origin));
      expect(incomplete.status).toBe(503);
      expect(problemResponseSchema.parse(await incomplete.json()).code).toBe("not_ready");
    } finally {
      await database.get().sql`alter table public.job_effects_hidden_fixture rename to job_effects`;
    }
    const ready = await fetch(new URL("/readyz", origin));
    expect(ready.status).toBe(200);
    expect(readyResponseSchema.parse(await ready.json())).toEqual({ status: "ready" });
  } finally {
    child.kill("SIGTERM");
    await closed;
  }
}, 30_000);
