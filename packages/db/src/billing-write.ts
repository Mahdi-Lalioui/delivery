import type {
  adminBillingSettingsInput,
  adminIssueInvoiceInput,
  billingInvoice,
} from "@zaafran/contracts/billing";
import type { TransactionSql } from "postgres";
import {
  auditInvoice,
  runBillingCommand,
  type BillingChange,
  type BillingWriteRequest,
} from "./billing-command.js";
import {
  recordBillingPayment,
  voidBillingInvoice,
  type RecordPaymentRequest,
  type VoidInvoiceRequest,
} from "./billing-settlement.js";
import { readBillingSettings, writeBillingSettings } from "./billing-settings.js";
import type { DatabaseConnection } from "./database.js";

type IssueInput = ReturnType<typeof adminIssueInvoiceInput.parse>;
type Invoice = ReturnType<typeof billingInvoice.parse>;
type IssueInvoiceRequest = BillingWriteRequest<IssueInput> & { readonly merchantId: string };
type SettingsRequest = BillingWriteRequest<ReturnType<typeof adminBillingSettingsInput.parse>>;

async function allocateInvoiceNumber(sql: TransactionSql, now: Date) {
  const [sequence] = await sql<{ year: number; lastValue: number }[]>`
    INSERT INTO public.invoice_sequences AS counter (year, last_value)
    VALUES (extract(year FROM ${now.toISOString()}::timestamptz AT TIME ZONE 'Africa/Algiers')::smallint, 1)
    ON CONFLICT (year) DO UPDATE SET last_value = counter.last_value + 1
      WHERE counter.last_value < 999999
    RETURNING year, last_value AS "lastValue"
  `;
  return (
    sequence &&
    `${String(sequence.year).padStart(4, "0")}-${String(sequence.lastValue).padStart(6, "0")}`
  );
}

async function lockIssueTarget(sql: TransactionSql, merchantId: string) {
  // Merchant-first locking follows the other administrative and merchant writes.
  const [merchant] = await sql<{ isDemo: boolean }[]>`
    SELECT is_demo AS "isDemo" FROM public.merchants WHERE id = ${merchantId} FOR NO KEY UPDATE
  `;
  if (!merchant) return { kind: "not_found" } as const;
  if (merchant.isDemo) return { kind: "invalid_status" } as const;
  const [subscription] = await sql<
    { subscriptionId: string; priceDzd: number; isCancelled: boolean }[]
  >`
    SELECT id AS "subscriptionId", price_dzd AS "priceDzd", status = 'cancelled' AS "isCancelled"
    FROM public.subscriptions WHERE merchant_id = ${merchantId} FOR NO KEY UPDATE
  `;
  if (!subscription) return { kind: "not_found" } as const;
  if (subscription.isCancelled) return { kind: "invalid_status" } as const;
  return { kind: "eligible", ...subscription } as const;
}

async function issueBillingInvoice(
  sql: TransactionSql,
  { actorId, merchantId, input, now }: IssueInvoiceRequest & { readonly actorId: string },
): Promise<BillingChange<Invoice>> {
  const target = await lockIssueTarget(sql, merchantId);
  if (target.kind !== "eligible") return target;
  const { subscriptionId, priceDzd: subtotalDzd } = target;
  const period = {
    startsAt: new Date(input.period.startsAt).toISOString(),
    endsAt: new Date(input.period.endsAt).toISOString(),
  };
  const [existing] = await sql`
    SELECT FROM public.invoices
    WHERE subscription_id = ${subscriptionId}
      AND period_starts_at < ${period.endsAt}::timestamptz
      AND (period_starts_at = ${period.startsAt}::timestamptz
        OR (status <> 'void' AND period_ends_at > ${period.startsAt}::timestamptz))
    LIMIT 1
  `;
  if (existing) return { kind: "duplicate_period" };

  const { taxRateBasisPoints, dueDays } = await readBillingSettings(sql, "share");
  const taxDzd = Number((BigInt(subtotalDzd) * BigInt(taxRateBasisPoints) + 5_000n) / 10_000n);
  const totalDzd = subtotalDzd + taxDzd;
  if (totalDzd > 2_147_483_647) return { kind: "invoice_total_out_of_range" };
  const number = await allocateInvoiceNumber(sql, now);
  if (!number) return { kind: "invoice_sequence_exhausted" };

  const issuedAt = now.toISOString();
  const dueAt = new Date(now.getTime() + dueDays * 86_400_000).toISOString();
  const [invoice] = await sql<{ invoiceId: string }[]>`
    INSERT INTO public.invoices (merchant_id, subscription_id, number, period_starts_at, period_ends_at,
      issued_at, due_at, subtotal_dzd, tax_rate_basis_points, tax_dzd, total_dzd)
    VALUES (${merchantId}, ${subscriptionId}, ${number}, ${period.startsAt}, ${period.endsAt},
      ${issuedAt}, ${dueAt}, ${subtotalDzd}, ${taxRateBasisPoints}, ${taxDzd}, ${totalDzd})
    RETURNING id AS "invoiceId"
  `;
  if (!invoice) throw new Error("Invoice insert returned no row.");
  await auditInvoice(sql, {
    actorId,
    merchantId,
    action: "invoice_issued",
    reason: input.reason,
    now,
  });
  return {
    kind: "applied",
    value: {
      ...invoice,
      merchantId,
      number,
      status: "issued",
      period,
      issuedAt,
      dueAt,
      subtotalDzd,
      taxRateBasisPoints,
      taxDzd,
      totalDzd,
      pdfAvailable: false,
    },
  };
}

export function createBillingWriteRepository({ sql }: DatabaseConnection) {
  return {
    issue: (request: IssueInvoiceRequest) =>
      sql.begin((tx) =>
        runBillingCommand(tx, request, {
          operation: "invoice_issue",
          targetId: request.merchantId,
          apply: (actorId) => issueBillingInvoice(tx, { ...request, actorId }),
        }),
      ),
    voidInvoice: (request: VoidInvoiceRequest) =>
      sql.begin((tx) =>
        runBillingCommand(tx, request, {
          operation: "invoice_void",
          targetId: request.invoiceId,
          apply: (actorId) => voidBillingInvoice(tx, { ...request, actorId }),
        }),
      ),
    recordPayment: (request: RecordPaymentRequest) =>
      sql.begin((tx) =>
        runBillingCommand(tx, request, {
          operation: "payment_record",
          targetId: request.invoiceId,
          apply: (actorId) => recordBillingPayment(tx, { ...request, actorId }),
        }),
      ),
    updateSettings: (request: SettingsRequest) =>
      sql.begin((tx) =>
        runBillingCommand(tx, request, {
          operation: "settings_update",
          targetId: null,
          apply: async () => ({
            kind: "applied",
            value: await writeBillingSettings(tx, request.input.settings),
          }),
        }),
      ),
  };
}
