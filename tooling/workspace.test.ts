import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";

const workspace = dirname(import.meta.dirname);

function configPath(relativePath: string): string {
  const path = join(workspace, relativePath);
  assert.ok(existsSync(path), `Missing workspace configuration: ${relativePath}`);
  return path;
}

function createFixture(context: TestContext, files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "zaafran-tooling-"));
  context.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  for (const [name, contents] of Object.entries(files)) {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  return directory;
}

function runTool(tool: string, cwd: string, args: string[]) {
  const command = join(workspace, "node_modules", ".bin", tool);
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

void test("[M0-2] TypeScript rejects unsafe types and implicit overrides", (context) => {
  const fixture = createFixture(context, {
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.json": JSON.stringify({
      extends: configPath("packages/config/tsconfig/base.json"),
      include: ["source.ts"],
    }),
    "source.ts": `
declare const names: Record<string, string>;
export const name: string = names["missing"];

type Settings = { label?: string };
export const settings: Settings = { label: undefined };

class Parent {
  getName(): string { return "parent"; }
}
export class Child extends Parent {
  getName(): string { return "child"; }
}
`,
  });

  const result = runTool("tsc", fixture, ["--noEmit", "--pretty", "false"]);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /source\.ts\(3,\d+\): error TS2322:/);
  assert.match(result.output, /source\.ts\(6,\d+\): error TS2375:/);
  assert.match(result.output, /source\.ts\(12,\d+\): error TS4114:/);
});

void test("[M0-2] ESLint rejects unsafe code and console logging", (context) => {
  const config = configPath("eslint.config.mjs");
  const fixture = createFixture(context, {
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.json": JSON.stringify({
      extends: configPath("packages/config/tsconfig/base.json"),
      include: ["packages/domain/src/unsafe.ts"],
    }),
    "packages/domain/src/unsafe.ts": `
export function unsafeValue(input: unknown): string {
  const annotated: any = input;
  console.log(annotated);
  return input as string;
}
`,
  });

  const result = runTool("eslint", fixture, [
    "--config",
    config,
    "--no-color",
    "packages/domain/src/unsafe.ts",
  ]);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\berror\b[^\n]*@typescript-eslint\/no-explicit-any\b/);
  assert.match(result.output, /\berror\b[^\n]*@typescript-eslint\/no-unsafe-type-assertion\b/);
  assert.match(result.output, /\berror\b[^\n]*\bno-console\b/);
});

void test("[M0-2] dependency-cruiser rejects a domain dependency on the database", (context) => {
  const config = configPath("dependency-cruiser.cjs");
  const fixture = createFixture(context, {
    "packages/domain/src/index.ts": 'export { database } from "../../db/src/index.js";\n',
    "packages/db/src/index.ts": 'export const database = "db";\n',
  });

  const result = runTool("depcruise", fixture, [
    "--config",
    config,
    "--output-type",
    "err",
    "packages/domain/src/index.ts",
  ]);
  assert.notEqual(result.status, 0, result.output);
  assert.match(
    result.output,
    /\berror\b[^\n]*packages\/domain\/src\/index\.ts[^\n]*packages\/db\/src\/index\.ts/,
  );
});

void test("[M0-2] Vitest rejects domain coverage below the line and branch thresholds", (context) => {
  const config = configPath("vitest.config.ts");
  const fixture = createFixture(context, {
    "package.json": JSON.stringify({ type: "module" }),
    "packages/domain/src/label.ts": `
export function label(isOpen: boolean): string {
  if (isOpen) {
    return "open";
  }
  return "closed";
}
`,
    "packages/domain/src/label.test.ts": `
import { expect, test } from "vitest";
import { label } from "./label";

test("labels an open restaurant", () => {
  expect(label(true)).toBe("open");
});
`,
  });
  symlinkSync(join(workspace, "node_modules"), join(fixture, "node_modules"), "junction");

  const result = runTool("vitest", fixture, ["run", "--coverage", "--config", config]);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Coverage for lines[^\n]*threshold \(95%\)/);
  assert.match(result.output, /Coverage for branches[^\n]*threshold \(90%\)/);
});

void test("dependency-cruiser ignores pnpm's cached project artifacts", (context) => {
  const config = configPath("dependency-cruiser.cjs");
  const fixture = createFixture(context, {
    "packages/domain/src/index.ts": "export const label = 'open';\n",
    ".pnpm-store/v11/projects/cached/packages/domain/dist/index.d.ts":
      'export type { OldType } from "./deleted-source.ts";\n',
  });

  const result = runTool("depcruise", fixture, ["--config", config, "--output-type", "err", "."]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /1 modules?/);
});
