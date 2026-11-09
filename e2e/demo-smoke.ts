import { randomUUID } from "node:crypto";
import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { tourGroups, tourLocales } from "../apps/web/src/local-demo/tour-stops.ts";
import {
  requestOtpOutput,
  verifyOtpOutput,
  verifyTotpOutput,
} from "../packages/contracts/src/auth.ts";

const origin = "http://127.0.0.1:3310";
const phones = {
  customer: "+213500000001",
  owner: "+213500000002",
  admin: "+213500000003",
};
type Role = keyof typeof phones;

async function signIn(context: BrowserContext, role: Role) {
  const command = () => ({ origin, "idempotency-key": randomUUID() });
  const send = await context.request.post(origin + "/v1/auth/otp/request", {
    headers: command(),
    data: { phone: phones[role], purpose: role === "admin" ? "admin_sign_in" : "sign_in" },
  });
  if (send.status() !== 202)
    throw new Error(`${role} OTP request returned ${String(send.status())}`);
  const { challengeId } = requestOtpOutput.parse(await send.json());
  const verify = await context.request.post(origin + "/v1/auth/otp/verify", {
    headers: command(),
    data: { challengeId, transport: "web", code: "314159" },
  });
  if (!verify.ok()) throw new Error(`${role} OTP verification returned ${String(verify.status())}`);
  const output = verifyOtpOutput.parse(await verify.json());
  if (role !== "admin") {
    if (output.status !== "authenticated") throw new Error(`${role} is missing its session`);
    return;
  }
  if (output.status !== "totp_required") throw new Error("Admin second factor did not appear");
  const second = await context.request.post(origin + "/v1/auth/totp/verify", {
    headers: command(),
    data: { challengeId: output.challengeId, transport: "web", code: "271828" },
  });
  if (!second.ok()) throw new Error(`Admin second factor returned ${String(second.status())}`);
  verifyTotpOutput.parse(await second.json());
}

async function openItem(page: Page) {
  await page.locator(".restaurant-dish-actions button:enabled").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".ui-skeleton")).toHaveCount(0);
  return dialog;
}

const actions: Record<string, (page: Page) => Promise<void>> = {
  async location(page) {
    await page.locator(".discovery-location button[aria-haspopup]").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
  async search(page) {
    await page.locator(".discovery-search-trigger").click();
    await page.getByRole("searchbox").fill("couscous");
  },
  async item(page) {
    await expect(await openItem(page)).toBeVisible();
  },
  async cart(page) {
    if (!(await page.locator(".restaurant-cart-button").isVisible())) {
      const dialog = await openItem(page);
      await dialog.locator(".ui-button-primary").click();
    }
    await page.locator(".restaurant-cart-button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
  async receipt(page) {
    await page.locator(".orders-card button[aria-expanded]").first().click();
    await expect(page.locator(".orders-receipt")).toBeVisible();
  },
  async import(page) {
    await page.locator('button[aria-controls="menu-category-import"]').click();
    await expect(page.locator("#menu-import-title")).toBeVisible();
  },
};

async function inspectPage(
  page: Page,
  { path, action }: { path: string; action?: string },
  errors: string[],
) {
  errors.length = 0;
  const response = await page.goto(origin + path, { waitUntil: "networkidle", timeout: 45_000 });
  if (!response?.ok()) throw new Error(`HTTP ${String(response?.status())}`);
  await expect(page.getByRole("main").first()).toBeVisible();
  if (action !== undefined) await actions[action]?.(page);
  const state = page.locator(
    (await page.locator("dialog[open]").count()) ? "dialog[open]" : "main",
  );
  await expect(
    state.locator(".ui-skeleton:visible:not(.restaurant-category .ui-skeleton)"),
  ).toHaveCount(0, { timeout: 8_000 });
  const alerts = await state.locator("[role=alert]:visible:not(.billing-banner)").allTextContents();
  const visibleErrors = alerts.map((message) => message.trim()).filter(Boolean);
  if (visibleErrors.length > 0) throw new Error(visibleErrors.join(" · "));
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.scrollWidth - innerWidth;
    const elements = [...document.querySelectorAll("main *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > innerWidth + 1 || rect.left < -1;
      })
      .slice(0, 6)
      .map((element) => element.getAttribute("class") ?? element.localName);
    return { width, elements };
  });
  if (overflow.width > 1) {
    throw new Error(
      `Horizontal overflow by ${String(overflow.width)} px · ${overflow.elements.join(", ")}`,
    );
  }
  if (errors.length > 0) throw new Error([...new Set(errors)].slice(0, 5).join(" · "));
}

type Visit = { path: string; width: number; action?: string };

function visits(group: (typeof tourGroups)[number]): Visit[] {
  const stops = group.role === "public" ? [{ path: "/dev/tour" }, ...group.stops] : group.stops;
  return tourLocales.flatMap((locale) =>
    [390, 1280].flatMap((width) =>
      stops.map((stop) => ({ ...stop, path: `/${locale}${stop.path}`, width })),
    ),
  );
}

async function inspectGroup(context: BrowserContext, group: (typeof tourGroups)[number]) {
  if (group.role !== "public") await signIn(context, group.role);
  const page = await context.newPage();
  page.setDefaultTimeout(7_000);
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 320));
  });
  const planned = visits(group);
  for (const visit of planned) {
    await page.setViewportSize({ width: visit.width, height: 900 });
    try {
      await inspectPage(page, visit, errors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${String(visit.width)}px ${visit.path} · ${message}`);
    }
  }
  return { checked: planned.length, failures };
}

const browser = await chromium.launch();
const failures: string[] = [];
let checked = 0;
try {
  for (const group of tourGroups) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const result = await inspectGroup(context, group);
    checked += result.checked;
    failures.push(...result.failures);
    await context.close();
  }
} finally {
  await browser.close();
}

for (const failure of failures) process.stderr.write(`${failure}\n`);
process.stdout.write(
  `Checked ${String(checked)} tour stops across Arabic, French, 390px and 1280px.\n`,
);
if (failures.length > 0) process.exitCode = 1;
