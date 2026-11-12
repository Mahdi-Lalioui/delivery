import type {
  merchantDeliverySettingsInput,
  merchantDeliverySettingsOutput,
} from "@zaafran/contracts/merchant-delivery";
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import type { DatabaseConnection } from "./database.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { runMenuCommand, type CommandChange, type CommandRequest } from "./menu-commands.js";

type Settings = z.infer<typeof merchantDeliverySettingsOutput>["settings"];
export type DeliveryReplace = CommandRequest<z.infer<typeof merchantDeliverySettingsInput>>;

const initialSettings: Settings = {
  pickupEnabled: false,
  deliveryEnabled: false,
  pickupMinimumDzd: 0,
  prepMinutes: 20,
  zone: null,
};

async function readSettings(sql: TransactionSql, scope: MenuScope) {
  const menu = await readMenuContext(sql, scope);
  if (!menu) return undefined;
  const [settings] = await sql<Settings[]>`
    SELECT settings.pickup_enabled AS "pickupEnabled", settings.delivery_enabled AS "deliveryEnabled",
      settings.pickup_minimum_dzd AS "pickupMinimumDzd", settings.prep_minutes AS "prepMinutes",
      CASE WHEN zone.id IS NOT NULL THEN jsonb_build_object(
        'radiusMeters', zone.radius_m, 'feeDzd', zone.fee_dzd,
        'minimumDzd', zone.minimum_dzd, 'travelMinutes', zone.travel_minutes
      ) END AS zone
    FROM public.merchant_order_settings AS settings
    LEFT JOIN public.delivery_zones AS zone ON zone.merchant_id = settings.merchant_id AND zone.merchant_managed
    WHERE settings.merchant_id = ${scope.merchantId}
  `;
  return { revision: menu.revision, settings: settings ?? initialSettings };
}

async function updateRadius(
  sql: TransactionSql,
  { merchantId, input: { zone, deliveryEnabled } }: DeliveryReplace,
) {
  if (!zone) {
    await sql`
      UPDATE public.delivery_zones SET active = false WHERE merchant_id = ${merchantId} AND merchant_managed
    `;
    return;
  }
  await sql`
    INSERT INTO public.delivery_zones (merchant_id, radius_m, fee_dzd, minimum_dzd,
      travel_minutes, active, merchant_managed)
    VALUES (${merchantId}, ${zone.radiusMeters}, ${zone.feeDzd}, ${zone.minimumDzd},
      ${zone.travelMinutes}, ${deliveryEnabled}, true)
    ON CONFLICT (merchant_id) WHERE merchant_managed DO UPDATE SET
      radius_m = EXCLUDED.radius_m, fee_dzd = EXCLUDED.fee_dzd,
      minimum_dzd = EXCLUDED.minimum_dzd, travel_minutes = EXCLUDED.travel_minutes,
      active = EXCLUDED.active
  `;
}

async function replaceSettings(
  sql: TransactionSql,
  request: DeliveryReplace,
): Promise<CommandChange<object, never>> {
  const { merchantId, input: settings } = request;
  await sql`
    INSERT INTO public.merchant_order_settings (merchant_id, pickup_enabled, delivery_enabled,
      pickup_minimum_dzd, prep_minutes)
    VALUES (${merchantId}, ${settings.pickupEnabled}, ${settings.deliveryEnabled},
      ${settings.pickupMinimumDzd}, ${settings.prepMinutes})
    ON CONFLICT (merchant_id) DO UPDATE SET pickup_enabled = EXCLUDED.pickup_enabled,
      delivery_enabled = EXCLUDED.delivery_enabled, pickup_minimum_dzd = EXCLUDED.pickup_minimum_dzd,
      prep_minutes = EXCLUDED.prep_minutes
  `;
  await updateRadius(sql, request);
  return { kind: "changed", value: {} };
}

export function createMerchantDeliveryRepository({ sql }: DatabaseConnection) {
  return {
    read: (scope: MenuScope) =>
      sql.begin("isolation level repeatable read read only", (tx) => readSettings(tx, scope)),
    replace: (request: DeliveryReplace) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "delivery_settings_replace",
          apply: () => replaceSettings(tx, request),
        }),
      ),
  };
}
