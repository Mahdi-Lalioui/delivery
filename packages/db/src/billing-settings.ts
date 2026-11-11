import type { adminBillingSettingsInput } from "@zaafran/contracts/billing";
import type { TransactionSql } from "postgres";

type BillingSettings = ReturnType<typeof adminBillingSettingsInput.parse>["settings"];

export async function readBillingSettings(sql: TransactionSql, lock: "read" | "share" = "read") {
  const rowLock = lock === "share" ? sql`FOR SHARE` : sql``;
  const [settings] = await sql<BillingSettings[]>`
    SELECT price_dzd AS "priceDzd", trial_days AS "trialDays", due_days AS "dueDays",
      grace_days AS "graceDays", tax_rate_basis_points AS "taxRateBasisPoints",
      CASE WHEN company_name IS NOT NULL THEN jsonb_build_object(
        'companyName', company_name, 'companyAddress', company_address,
        'registrationNumber', registration_number, 'taxId', tax_id
      ) ELSE NULL END AS "legalDetails",
      subscription_online_payment_enabled AS "subscriptionOnlinePaymentEnabled"
    FROM public.billing_settings WHERE singleton ${rowLock}
  `;
  if (!settings) throw new Error("Missing billing settings singleton.");
  return settings;
}

export async function writeBillingSettings(sql: TransactionSql, settings: BillingSettings) {
  const { priceDzd, trialDays, dueDays, graceDays, taxRateBasisPoints, legalDetails } = settings;
  const update = await sql`
    UPDATE public.billing_settings SET price_dzd = ${priceDzd}, trial_days = ${trialDays},
      due_days = ${dueDays}, grace_days = ${graceDays}, tax_rate_basis_points = ${taxRateBasisPoints},
      company_name = ${legalDetails?.companyName ?? null}, company_address = ${legalDetails?.companyAddress ?? null},
      registration_number = ${legalDetails?.registrationNumber ?? null}, tax_id = ${legalDetails?.taxId ?? null},
      subscription_online_payment_enabled = ${settings.subscriptionOnlinePaymentEnabled}
    WHERE singleton
  `;
  if (update.count !== 1) throw new Error("Missing billing settings singleton.");
  return { settings };
}
