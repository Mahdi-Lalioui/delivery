import { randomUUIDv7 } from "node:crypto";
import type { DatabaseConnection } from "@zaafran/db/database";
import type { AlgiersCommune } from "./e2e-auth-types.ts";

export async function seedAdminOrder(
  { sql }: DatabaseConnection,
  { commune, now }: { commune: AlgiersCommune; now: Date },
) {
  const orderId = randomUUIDv7();
  const merchantId = randomUUIDv7();
  const customerId = randomUUIDv7();
  const restaurantName = "Comptoir fictif · مطعم تجريبي";
  const shortCode = "AWD-2A2";
  const at = now.toISOString();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO users (id, phone_e164, created_at) VALUES (${customerId}, '+213550000299', ${at})
    `;
    await tx`
      INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
        location, cuisines, status, created_at)
      SELECT ${merchantId}, 'fixture-admin-order', ${restaurantName}, 'Équipe fictive', '+213550000298',
        id, centroid, ARRAY['algerian'], 'active', ${at}
      FROM communes WHERE id = ${commune.id}
    `;
    await tx`
      INSERT INTO orders (id, quote_id, customer_id, merchant_id, restaurant_name, short_code, order_day,
        status, fulfilment, version, placed_at, last_event_at, subtotal_dzd, delivery_fee_dzd,
        total_dzd, paying_with_dzd, lines)
      VALUES (${orderId}, ${randomUUIDv7()}, ${customerId}, ${merchantId}, ${restaurantName}, ${shortCode},
        ${at}::date, 'accepted', 'pickup', 1, ${at}, ${at}, 950, 0, 950, 1000, '[]')
    `;
    await tx`
      INSERT INTO order_events (order_id, version, to_status, actor_kind, actor_id, payload, occurred_at)
      VALUES (${orderId}, 1, 'accepted', 'merchant', null, '{}', ${at})
    `;
  });
  return { orderId, shortCode, restaurantName };
}
