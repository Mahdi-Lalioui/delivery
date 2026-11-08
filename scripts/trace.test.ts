import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTrace, getSpecIds, getTitleIds } from "./trace-spec.ts";

void test("[M0-3] reads IDs only from acceptance declarations and NFR table rows", () => {
  const spec = `
This prose refers to ORD-90.
- **I18N-01** Localize each screen (see ORD-91).
- **ORD-01** Accept a new order.
- See **ORD-92** for the next step.

| ID | Target |
| -- | ------ |
| NFR-01 | Render promptly (see ORD-93). |
| orders | ORD-94 |
`;

  assert.deepEqual(getSpecIds(spec).sort(), ["I18N-01", "NFR-01", "ORD-01"]);
});

void test("[M0-3] rejects duplicate acceptance declarations", () => {
  const spec = "- **ORD-01** Accept an order.\n- **ORD-01** Accept it again.\n";

  assert.throws(() => getSpecIds(spec));
});

void test("[M0-3] reads canonical IDs from static test titles", () => {
  const source = `
import { test, it } from "vitest";
test("[I18N-01] [ORD-01] orders in Arabic", () => {});
it.each([[1]])('[ORD-02] uses the current order', () => {});
test.concurrent(\`[ORD-03] handles concurrent requests\`, () => {});
test('[ORD-04] completes checkout', async ({ page }) => {});
`;

  assert.deepEqual(getTitleIds(source).sort(), ["I18N-01", "ORD-01", "ORD-02", "ORD-03", "ORD-04"]);
});

void test("[M0-3] ignores incidental references and incomplete tags", () => {
  const source = `
import { test, describe } from "vitest";
// test("[ORD-01] comment", () => {});
/* it('[ORD-02] block comment', () => {}); */
const note = 'test("[ORD-03] example", () => {});';
describe("[ORD-04] group name", () => {});
test("ORD-05 plain reference and [ORD-06:domain] incomplete tag", () => {
  expect("[ORD-07] assertion input");
});
const order = "current";
test(\`[ORD-08] checks \${order}\`, () => {});
test.step("[ORD-09] step title", () => {});
`;

  assert.deepEqual(getTitleIds(source), []);
});

void test("[M0-3] ignores skipped, pending, and focused tests as proof", () => {
  const source = `
import { test, it } from "vitest";
test.skip("[ORD-01] skipped", () => {});
it.todo("[ORD-02] pending");
test.only("[ORD-03] focused", () => {});
it.skip.each([[1]])("[ORD-04] skipped cases", () => {});
test.fixme("[ORD-05] disabled Playwright case", async () => {});
`;

  assert.deepEqual(getTitleIds(source), []);
});

void test("[M0-3] reports missing current and prior IDs and keeps future IDs pending", () => {
  const specIds = ["AUTH-01", "ORD-01", "ORD-02", "RT-01", "MOB-01"];
  const ownership = new Map([
    ["AUTH-01", 2],
    ["ORD-01", 4],
    ["ORD-02", 4],
    ["RT-01", 6],
    ["MOB-01", 10],
  ]);

  const result = checkTrace({ specIds, titleIds: ["ORD-01", "RT-01"], ownership, through: 4 });

  assert.deepEqual(result.missing.sort(), ["AUTH-01", "ORD-02"]);
  assert.deepEqual(result.pending.sort(), ["MOB-01", "RT-01"]);
});

void test("[M0-3] requires coverage through the final release milestone", () => {
  const specIds = ["ORD-01", "MOB-01"];
  const ownership = new Map([
    ["ORD-01", 4],
    ["MOB-01", 12],
  ]);

  assert.deepEqual(checkTrace({ specIds, titleIds: ["ORD-01"], ownership, through: 12 }), {
    missing: ["MOB-01"],
    pending: [],
  });
});

void test("[M0-3] rejects a test title that cites an undeclared ID", () => {
  assert.throws(() =>
    checkTrace({
      specIds: ["ORD-01"],
      titleIds: ["ORD-99"],
      ownership: new Map([["ORD-01", 4]]),
      through: 4,
    }),
  );
});

void test("[M0-3] rejects an acceptance ID with no milestone ownership", () => {
  assert.throws(() =>
    checkTrace({ specIds: ["ORD-01"], titleIds: [], ownership: new Map(), through: 4 }),
  );
});

void test("[M0-3] rejects ownership of an undeclared ID", () => {
  const ownership = new Map([
    ["ORD-01", 4],
    ["ORD-99", 4],
  ]);

  assert.throws(() =>
    checkTrace({ specIds: ["ORD-01"], titleIds: ["ORD-01"], ownership, through: 4 }),
  );
});

void test("[M0-3] ignores a pending declaration with no test body", () => {
  assert.deepEqual(getTitleIds('import { test } from "node:test"; test("[ORD-01] pending");'), []);
});

void test("[M0-3] excludes disabled suites, empty tables and unrelated test calls", () => {
  const source = `
import { describe, it, test as unit } from "vitest";
import { test as browser } from "@playwright/test";
describe.skipIf(true)("disabled", () => unit("[AUTH-06] hidden", () => {}));
browser.describe("conditional suite", () => {
  browser.skip(true, "unsupported");
  browser("[AUTH-08] hidden browser case", async () => {});
});
it.each([])("[I18N-07] no case", () => {});
function test(label, value) { return [label, value]; }
test("[I18N-01] unrelated helper", 42);
unit("[ORD-01] registered", () => {});
`;

  assert.deepEqual(getTitleIds(source), ["ORD-01"]);
});

void test("[M0-3] reads a tagged TS test after a generic arrow function", () => {
  const source = `
import { test } from "node:test";
const identity = <T>(value: T): T => value;
void test("[ORD-01] validates the order", () => { identity(42); });
`;

  assert.deepEqual(getTitleIds(source), ["ORD-01"]);
});

void test("[M0-3] ignores skipped options, spread-only tables and locally shadowed bindings", () => {
  const source = `
import { describe, test } from "vitest";
test("[AUTH-06] disabled test", { skip: true }, () => {});
describe("disabled suite", { skip: true }, () => {
  test("[I18N-01] hidden", () => {});
});
test.each([...[]])("[I18N-07] empty spread", () => {});
describe("local shadow", () => {
  const { test } = localHelper;
  test("[AUTH-08] unrelated helper", () => {});
});
test("[ORD-01] active", () => {});
`;
  assert.deepEqual(getTitleIds(source), ["ORD-01"]);
});
