import {
  adminPlatformSettingsOutput,
  platformSettingValue,
  type adminPlatformSettingInput,
} from "@zaafran/contracts/admin-ops";
import { adminBillingSettingsInput } from "@zaafran/contracts/billing";
import type { TransactionSql } from "postgres";
import { readBillingSettings, writeBillingSettings } from "../billing-settings.js";
import type { Change, PlatformCommandRequest } from "./commands.js";

export const settingsResult = adminPlatformSettingsOutput.omit({ sessionId: true });
type SettingsResult = ReturnType<typeof settingsResult.parse>;
type SettingValue = ReturnType<typeof adminPlatformSettingInput.parse>["value"];
export type SettingWrite = PlatformCommandRequest<{ readonly value: SettingValue }> & {
  readonly key: keyof typeof platformSettingValue;
};

type InvalidSettingValue = { readonly kind: "invalid_setting_value" };
type BillingSettingKey = "subscription_price_dzd" | "subscription_trial_days";

export async function readPlatformSettings(sql: TransactionSql): Promise<SettingsResult> {
  const [row] = await sql<{ settings: unknown }[]>`
    SELECT jsonb_build_object('subscription_price_dzd', price_dzd,
      'subscription_trial_days', trial_days) || (
        SELECT jsonb_object_agg(key, value) FROM public.platform_settings
        WHERE key IN ('order_accept_timeout_seconds', 'first_order_cash_cap_dzd', 'maintenance_banner')
      ) AS settings
    FROM public.billing_settings WHERE singleton
  `;
  return settingsResult.parse(row);
}

export async function lockBillingSettingsForWrite(sql: TransactionSql) {
  await sql`SELECT singleton FROM public.billing_settings WHERE singleton FOR NO KEY UPDATE`;
  return readBillingSettings(sql);
}

async function writeSubscriptionSetting(
  sql: TransactionSql,
  key: BillingSettingKey,
  value: number,
) {
  const settings = await lockBillingSettingsForWrite(sql);
  const field = key === "subscription_price_dzd" ? "priceDzd" : "trialDays";
  const next = adminBillingSettingsInput.shape.settings.safeParse({ ...settings, [field]: value });
  if (!next.success) return undefined;
  await writeBillingSettings(sql, next.data);
  return { before: settings[field], after: value };
}

async function writePlatformSetting(
  sql: TransactionSql,
  request: SettingWrite,
  value: SettingValue,
) {
  const [row] = await sql<{ value: unknown }[]>`
    UPDATE public.platform_settings
    SET value = ${JSON.stringify(value)}::jsonb, updated_by = ${request.adminUserId},
      updated_at = ${request.now.toISOString()}::timestamptz
    WHERE key = ${request.key}
    RETURNING old.value
  `;
  if (!row) throw new Error("Platform setting is missing.");
  return { before: row.value, after: value };
}

export async function applySetting(
  sql: TransactionSql,
  request: SettingWrite,
): Promise<Change<SettingsResult> | InvalidSettingValue> {
  const { key, input } = request;
  const value = platformSettingValue[key].safeParse(input.value);
  if (!value.success) return { kind: "invalid_setting_value" };
  if (key === "subscription_price_dzd" || key === "subscription_trial_days") {
    if (typeof value.data !== "number") return { kind: "invalid_setting_value" };
    const diff = await writeSubscriptionSetting(sql, key, value.data);
    if (!diff) return { kind: "invalid_setting_value" };
    return { value: await readPlatformSettings(sql), diff };
  }
  const diff = await writePlatformSetting(sql, request, value.data);
  return { value: await readPlatformSettings(sql), diff };
}
