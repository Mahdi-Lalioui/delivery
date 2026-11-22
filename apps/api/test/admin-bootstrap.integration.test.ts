import { spawnSync } from "node:child_process";
import { randomBytes, randomUUIDv7 } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { registerTestDatabase } from "../../../packages/db/test/database.ts";
import { bootstrapAdmin } from "../src/admin-bootstrap.ts";
import { openTotpSecret } from "../src/auth-totp.ts";

const database = registerTestDatabase();
const key = Buffer.alloc(32, 7);

test("serializes first-admin creation and audits forced additions without exposing the seed", async () => {
  const { sql } = database.get();
  const first = "pilot-first@example.test";
  const second = "pilot-second@example.test";
  const blocked = "pilot-blocked@example.test";
  await sql`INSERT INTO public.users (email, created_at, blocked_at)
    VALUES (${first}, now(), NULL), (${second}, now(), NULL), (${blocked}, now(), now())`;
  for (const email of [first, second]) {
    await sql`INSERT INTO public.sessions (
      id, user_id, token_hash, transport, kind, request_ip, created_at, last_seen_at, expires_at
    )
    SELECT ${randomUUIDv7()}, id, ${randomBytes(32)}, 'web', 'standard', '192.0.2.10', now(), now(), now() + interval '1 day'
    FROM public.users WHERE email = ${email}`;
  }
  const provision = (email: string, force = false) =>
    bootstrapAdmin(database.get(), { email, force, key, operator: "pilot-operator" });

  await expect(provision("missing@example.test")).resolves.toEqual({ kind: "no_account" });
  await expect(provision(blocked)).resolves.toEqual({ kind: "no_account" });
  const results = await Promise.all([provision(first.toUpperCase()), provision(second)]);
  expect(results.map((result) => result.kind).sort()).toEqual(["admin_exists", "created"]);
  const created = results.find((result) => result.kind === "created");
  if (!created) throw new Error("Expected a provisioned administrator");
  const [row] = await sql<{ user_id: string; totp_secret_encrypted: Buffer }[]>`
    SELECT user_id, totp_secret_encrypted FROM public.admins
  `;
  expect(row?.user_id).toBe(created.userId);
  expect(
    openTotpSecret({
      key,
      userId: created.userId,
      sealed: row?.totp_secret_encrypted ?? Buffer.alloc(0),
    }),
  ).toEqual(created.secret);
  expect(await sql`SELECT user_id FROM public.sessions WHERE revoked_at IS NOT NULL`).toEqual([
    { user_id: created.userId },
  ]);
  const [owner] = await sql<
    { email: string }[]
  >`SELECT email FROM public.users WHERE id = ${created.userId}`;
  const remaining = owner?.email === first ? second : first;
  await expect(provision(owner?.email ?? "", true)).resolves.toEqual({ kind: "already_admin" });
  await expect(provision(remaining, true)).resolves.toMatchObject({ kind: "created" });
  expect(
    await sql`
    SELECT operator, forced FROM public.admin_bootstrap_audit ORDER BY created_at, id
  `,
  ).toEqual([
    { operator: "pilot-operator", forced: false },
    { operator: "pilot-operator", forced: true },
  ]);
});

test("the CLI refuses redirected input and output before asking for or issuing a secret", () => {
  const cli = fileURLToPath(new URL("../src/admin-bootstrap-cli.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", cli], {
    encoding: "utf8",
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    input: "pilot-first@example.test\npilot-operator\n",
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Run this command interactively over SSH");
});
