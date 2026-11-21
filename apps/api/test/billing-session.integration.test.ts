import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date("2026-11-19T12:00:00.000Z").toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[BIL-02][AUTH-07] billing read routes conceal another restaurant from real sessions", async () => {
  const [ownerA, ownerB, customer] = await Promise.all([
    seedActor("+213500000071", "standard"),
    seedActor("+213500000072", "standard"),
    seedActor("+213500000073", "standard"),
  ]);
  const [restaurantA, restaurantB] = await Promise.all([
    seedMenuMerchants(ownerA.userId, "1698"),
    seedMenuMerchants(ownerB.userId, "1699"),
  ]);
  const { sql } = database.get();
  const [subscription] = await sql<{ id: string }[]>`
    INSERT INTO public.subscriptions (merchant_id, status, price_dzd)
    VALUES (${restaurantA.owned}, 'active', 5000) RETURNING id
  `;
  if (!subscription) throw new Error("Missing subscription fixture");
  const invoiceNumber = "2026-000902";
  await sql`
    INSERT INTO public.invoices (
      merchant_id, subscription_id, number, status, period_starts_at, period_ends_at,
      issued_at, due_at, subtotal_dzd, tax_rate_basis_points, tax_dzd, total_dzd
    ) VALUES (${restaurantA.owned}, ${subscription.id}, ${invoiceNumber}, 'issued',
      ${now}, '2026-12-19T12:00:00.000Z', ${now}, '2026-11-26T12:00:00.000Z', 5000, 0, 0, 5000)
  `;
  const api = await openApi();

  for (const route of ["billing", "invoices"]) {
    const own = await api.inject({
      url: `/v1/merchants/${restaurantA.owned}/${route}`,
      headers: ownerA.headers,
    });
    expect(own.statusCode).toBe(200);
    const privateMarker = route === "invoices" ? invoiceNumber : subscription.id;
    expect(own.body).toContain(privateMarker);

    for (const actor of [ownerB, customer]) {
      const foreign = await api.inject({
        url: `/v1/merchants/${restaurantA.owned}/${route}`,
        headers: actor.headers,
      });
      expect(foreign.statusCode).toBe(404);
      expect(foreign.body).not.toContain(restaurantA.owned);
      expect(foreign.body).not.toContain(privateMarker);
    }

    const otherRestaurant = await api.inject({
      url: `/v1/merchants/${restaurantB.owned}/${route}`,
      headers: ownerA.headers,
    });
    expect(otherRestaurant.statusCode).toBe(404);
    expect(otherRestaurant.body).not.toContain(restaurantB.owned);
  }
});
