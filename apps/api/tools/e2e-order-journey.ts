import type { DatabaseConnection } from "@zaafran/db/database";
import type { AlgiersCommune } from "./e2e-auth-types.ts";

export async function configureOrderJourney(
  { sql }: DatabaseConnection,
  input: {
    commune: AlgiersCommune;
    ownerPhone: string;
    courierPhone?: string;
    timeoutSeconds: number;
  },
) {
  const slug = "chawarma-fixture";
  return sql.begin(async (tx) => {
    const [merchant] = await tx<{ id: string; categoryId: string }[]>`
      SELECT merchant.id, category.id AS "categoryId"
      FROM public.merchants AS merchant JOIN public.categories AS category ON category.merchant_id = merchant.id
      WHERE merchant.slug = ${slug}
    `;
    if (!merchant) throw new Error("Expected the synthetic order restaurant.");
    const merchantId = merchant.id;
    const [{ count } = { count: 0 }] = await tx<{ count: number }[]>`
      WITH membership AS (
        INSERT INTO public.merchant_members (merchant_id, user_id, role)
        SELECT ${merchantId}, id, 'owner' FROM public.users WHERE phone_e164 = ${input.ownerPhone}
        RETURNING 1
      )
      SELECT count(*)::int FROM membership
    `;
    if (count !== 1) throw new Error("Sign in the synthetic merchant owner first.");
    if (input.courierPhone) {
      const [courier] = await tx`
        INSERT INTO public.couriers (user_id, merchant_id, display_name, online, created_at)
        SELECT id, ${merchantId}, 'Nassim', true, now() FROM public.users WHERE phone_e164 = ${input.courierPhone}
        RETURNING id
      `;
      if (!courier) throw new Error("Sign in the synthetic courier first.");
    }
    await tx`
      INSERT INTO public.merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
      SELECT ${merchantId}, weekday, 0, 1440 FROM generate_series(0, 6) AS weekday
    `;
    await tx`
      INSERT INTO public.merchant_order_settings (merchant_id, pickup_enabled, delivery_enabled)
      VALUES (${merchantId}, true, true)
    `;
    await tx`
      INSERT INTO public.delivery_zones (merchant_id, radius_m, fee_dzd, minimum_dzd, travel_minutes)
      VALUES (${merchantId}, 2000, 137, 500, 15)
    `;
    await tx`
      INSERT INTO public.service_areas (slug, city, active, polygon)
      VALUES ('fixture-alger', 'Alger', true,
        ST_GeogFromText('SRID=4326;MULTIPOLYGON(((3 36,4 36,4 37,3 37,3 36)))'))
    `;
    await tx`
      UPDATE public.platform_settings SET value = to_jsonb(${input.timeoutSeconds}::int)
      WHERE key = 'order_accept_timeout_seconds'
    `;
    return { merchantId, categoryId: merchant.categoryId, commune: input.commune, slug };
  });
}
