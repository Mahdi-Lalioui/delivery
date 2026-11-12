import { expect, test } from "@playwright/test";
import { cartStorageKey } from "../apps/web/src/restaurant/cart-storage.ts";
import { addCartLine, configureCartLine } from "../packages/domain/src/cart.ts";
import { formatDzd } from "../packages/i18n/src/formats.ts";
import { withAuthHarness } from "./auth-fixture.ts";

const start = Date.UTC(2026, 10, 8, 12);
const initialExpiry = start + 60_000;
const renewedExpiry = start + 90_000;

function cartExpiringAt(expiresAt: number, quantity: number) {
  const line = configureCartLine({
    lineId: "cart-expiry-line",
    item: { itemId: "cart-expiry-item", names: { fr: "Plat" }, priceDzd: 500, isAvailable: true },
    optionGroups: [],
    selections: [],
    quantity,
    note: "",
  });
  if (!line.ok) throw new Error(line.error.code);
  const cart = addCartLine({
    cart: null,
    merchant: { merchantId: "cart-expiry-restaurant", name: "Restaurant", minimumDzd: 0 },
    line: line.value,
    now: start,
  });
  if (!cart.ok) throw new Error(cart.error.code);
  return { ...cart.value, expiresAt };
}

test("[CUS-09:browser] an old expiry timer preserves a renewed cart and clears it when due @cart-expiry", async ({
  baseURL,
  page,
}) => {
  await withAuthHarness(
    baseURL,
    async (harness) => {
      await harness.seedDiscoverySearch();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.clock.install({ time: start });
      await page.clock.pauseAt(start + 1_000);
      await page.addInitScript(
        ({ key, cart }) => {
          localStorage.setItem(key, JSON.stringify(cart));
        },
        { key: cartStorageKey, cart: cartExpiringAt(initialExpiry, 1) },
      );
      await page.goto(harness.origin + "/fr/restaurants/chawarma-fixture");
      const cart = page.getByRole("button", { name: "Voir le panier", exact: true });
      const choose = page.getByRole("button", { name: "Choisir · Chawarma poulet", exact: true });
      await expect(choose).toBeVisible();
      await expect(cart).toContainText(formatDzd(500, "fr"));
      const renewed = JSON.stringify(cartExpiringAt(renewedExpiry, 2));
      // Writing directly gives the timer the new saved value without first firing a storage event.
      await page.evaluate(
        ({ key, value }) => {
          localStorage.setItem(key, value);
        },
        { key: cartStorageKey, value: renewed },
      );
      await page.clock.fastForward(60_000);
      await expect(cart).toContainText(formatDzd(1_000, "fr"));
      expect(await page.evaluate((key) => localStorage.getItem(key), cartStorageKey)).toBe(renewed);
      await page.clock.fastForward(30_000);
      await expect(cart).toHaveCount(0);
      expect(await page.evaluate((key) => localStorage.getItem(key), cartStorageKey)).toBeNull();

      await page.evaluate(() => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Storage is blocked", "SecurityError");
          },
        });
      });
      await choose.click();
      const item = page.getByRole("dialog");
      await item.getByRole("radio", { name: /Sauce blanche/u }).check();
      await item.getByRole("button", { name: /^Ajouter/u }).click();
      await expect(cart).toContainText(formatDzd(550, "fr"));
      await page.clock.fastForward(7 * 24 * 60 * 60 * 1_000);
      await expect(cart).toHaveCount(0);
    },
    true,
  );
});
