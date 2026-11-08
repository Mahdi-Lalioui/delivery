import {
  adminFlagInput,
  adminFlagOutput,
  featureFlagKey,
  publicFlagsOutput,
} from "@zaafran/contracts/admin-ops";
import type { TransactionSql } from "postgres";
import { writeBillingSettings } from "../billing-settings.js";
import { timestampParsers } from "../timestamp-parsers.js";
import type { Change, PlatformCommandRequest } from "./commands.js";
import { lockBillingSettingsForWrite } from "./settings.js";

const orderingPrefix = "ordering:";
const publicFlagKeys = ["menu_photo_import", "online_payments", "ramadan_mode"];

type Flag = ReturnType<typeof adminFlagOutput.parse>;
export type FlagWrite = PlatformCommandRequest<ReturnType<typeof adminFlagInput.parse>>;

interface FlagRow {
  readonly key: string;
  readonly isEnabled: boolean;
  readonly scope: unknown;
}

export function canonicalFlagKey(key: string) {
  return featureFlagKey.parse(key).toLowerCase();
}

function orderingEntries(rows: readonly FlagRow[]) {
  return rows.flatMap<[string, boolean]>(({ key, isEnabled, scope }) => {
    const parsed = adminFlagOutput.shape.scope.safeParse(scope);
    const cityId = parsed.success ? parsed.data?.cityId : undefined;
    return cityId && key === `${orderingPrefix}${cityId}` ? [[cityId, isEnabled]] : [];
  });
}

export async function readPublicFlags(sql: TransactionSql) {
  const rows = await sql<FlagRow[]>`
    SELECT key, is_enabled AS "isEnabled", scope FROM public.feature_flags
    WHERE (key = ANY(${publicFlagKeys}::text[]) AND scope IS NULL) OR key LIKE 'ordering:%'
    ORDER BY key
  `;
  const [banner] = await sql<{ value: unknown }[]>`
    SELECT value FROM public.platform_settings WHERE key = 'maintenance_banner'
  `;
  const global = Object.fromEntries(
    rows
      .filter(({ key }) => publicFlagKeys.includes(key))
      .map(({ key, isEnabled }): [string, boolean] => [key, isEnabled]),
  );
  const cities = orderingEntries(rows);
  return publicFlagsOutput.parse({
    flags: cities.length > 0 ? { ...global, ordering: Object.fromEntries(cities) } : global,
    maintenanceBanner: banner?.value ?? null,
  });
}

async function writeFlagRow(sql: TransactionSql, request: FlagWrite, scope: Flag["scope"]) {
  const { key, adminUserId, now, input } = request;
  const [row] = await sql<{ previous: boolean | null; updatedAt: Date }[]>`
    INSERT INTO public.feature_flags (key, is_enabled, scope, updated_by, updated_at)
    VALUES (${key}, ${input.isEnabled}, ${scope === null ? null : JSON.stringify(scope)}::jsonb,
      ${adminUserId}, ${now.toISOString()}::timestamptz)
    ON CONFLICT (key) DO UPDATE SET is_enabled = excluded.is_enabled, scope = excluded.scope,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at
    RETURNING old.is_enabled AS previous, updated_at AS "updatedAt"
  `.parsers(timestampParsers);
  if (!row) throw new Error("Flag write returned no row.");
  return row;
}

async function writeSubscriptionFlag(sql: TransactionSql, isEnabled: boolean) {
  const settings = await lockBillingSettingsForWrite(sql);
  await writeBillingSettings(sql, { ...settings, subscriptionOnlinePaymentEnabled: isEnabled });
  return settings.subscriptionOnlinePaymentEnabled;
}

export async function applyFlag(sql: TransactionSql, request: FlagWrite): Promise<Change<Flag>> {
  const { key, input } = request;
  const { isEnabled } = adminFlagInput.parse(input);
  const scope = key.startsWith(orderingPrefix)
    ? { cityId: key.slice(orderingPrefix.length) }
    : null;
  const previousBilling =
    key === "subscription_online_payment" ? await writeSubscriptionFlag(sql, isEnabled) : undefined;
  const { previous, updatedAt } = await writeFlagRow(sql, request, scope);
  return {
    value: adminFlagOutput.parse({ key, scope, isEnabled, updatedAt: updatedAt.toISOString() }),
    diff: { before: previousBilling ?? previous, after: isEnabled },
  };
}
