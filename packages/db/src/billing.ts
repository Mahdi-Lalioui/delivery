import type { TransactionSql } from "postgres";
import { readBillingSettings } from "./billing-settings.js";
import type { DatabaseConnection } from "./database.js";
import { lockMerchantAdmin } from "./merchant-access.js";
import type { MenuScope } from "./menu-access.js";
import { timestampParsers } from "./timestamp-parsers.js";

export { createBillingWriteRepository } from "./billing-write.js";

type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";
type InvoiceStatus = "issued" | "paid" | "void";

interface BillingPage {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

interface AdminPage extends BillingPage {
  readonly adminUserId: string;
}

interface SubscriptionPage extends AdminPage {
  readonly merchantId?: string | undefined;
  readonly status?: SubscriptionStatus | undefined;
}

interface InvoicePage extends BillingPage {
  readonly merchantId?: string | undefined;
  readonly status?: InvoiceStatus | undefined;
}

interface TransferProofPage extends AdminPage {
  readonly invoiceId?: string | undefined;
}

interface SubscriptionRow {
  readonly subscriptionId: string;
  readonly merchantId: string;
  readonly status: SubscriptionStatus;
  readonly priceDzd: number;
  readonly trialEndsAt: Date | null;
  readonly periodStartsAt: Date | null;
  readonly periodEndsAt: Date | null;
  readonly nextInvoiceAt: Date | null;
}

interface InvoiceRow {
  readonly invoiceId: string;
  readonly merchantId: string;
  readonly number: string;
  readonly status: InvoiceStatus;
  readonly periodStartsAt: Date;
  readonly periodEndsAt: Date;
  readonly issuedAt: Date;
  readonly dueAt: Date;
  readonly subtotalDzd: number;
  readonly taxRateBasisPoints: number;
  readonly taxDzd: number;
  readonly totalDzd: number;
  readonly pdfAvailable: boolean;
}

interface TransferProofRow {
  readonly transferProofId: string;
  readonly invoiceId: string;
  readonly method: "ccp" | "baridimob";
  readonly reference: string;
  readonly proofMediaId: string;
  readonly status: "pending_confirmation";
  readonly submittedAt: Date;
}

async function readAsAdmin<Result>(
  sql: TransactionSql,
  adminUserId: string,
  read: () => Promise<Result>,
) {
  return (await lockMerchantAdmin(sql, adminUserId)) ? read() : undefined;
}

async function canReadMerchantBilling(sql: TransactionSql, { accountId, merchantId }: MenuScope) {
  const [owner] = await sql`
    SELECT FROM public.merchant_members AS member
    JOIN public.users AS account ON account.id = member.user_id
    WHERE member.merchant_id = ${merchantId} AND member.user_id = ${accountId}
      AND member.role = 'owner' AND account.blocked_at IS NULL AND account.deleted_at IS NULL
  `;
  return owner !== undefined;
}

function subscriptionColumns(sql: TransactionSql) {
  return sql`id AS "subscriptionId", merchant_id AS "merchantId", status, price_dzd AS "priceDzd",
    trial_ends_at AS "trialEndsAt", period_starts_at AS "periodStartsAt",
    period_ends_at AS "periodEndsAt", next_invoice_at AS "nextInvoiceAt"`;
}

function presentPeriod(startsAt: Date, endsAt: Date) {
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function presentSubscription({
  trialEndsAt,
  periodStartsAt,
  periodEndsAt,
  nextInvoiceAt,
  ...subscription
}: SubscriptionRow) {
  return {
    ...subscription,
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    period: periodStartsAt && periodEndsAt ? presentPeriod(periodStartsAt, periodEndsAt) : null,
    nextInvoiceAt: nextInvoiceAt?.toISOString() ?? null,
  };
}

function presentInvoice({ periodStartsAt, periodEndsAt, issuedAt, dueAt, ...invoice }: InvoiceRow) {
  return {
    ...invoice,
    period: presentPeriod(periodStartsAt, periodEndsAt),
    issuedAt: issuedAt.toISOString(),
    dueAt: dueAt.toISOString(),
  };
}

function limitPage<Row>(rows: readonly Row[], limit: number, id: (row: Row) => string) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? id(last) : null };
}

async function listSubscriptions(
  sql: TransactionSql,
  { merchantId, status, cursor, limit }: SubscriptionPage,
) {
  const rows = await sql<SubscriptionRow[]>`
    SELECT ${subscriptionColumns(sql)} FROM public.subscriptions
    WHERE (${merchantId ?? null}::uuid IS NULL OR merchant_id = ${merchantId ?? null}::uuid)
      AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
      AND (${cursor ?? null}::uuid IS NULL OR id < ${cursor ?? null}::uuid)
    ORDER BY id DESC LIMIT ${limit + 1}
  `.parsers(timestampParsers);
  const { items, nextCursor } = limitPage(rows, limit, ({ subscriptionId }) => subscriptionId);
  return { subscriptions: items.map(presentSubscription), nextCursor };
}

async function listInvoices(
  sql: TransactionSql,
  { merchantId, status, cursor, limit }: InvoicePage,
) {
  const rows = await sql<InvoiceRow[]>`
    SELECT id AS "invoiceId", merchant_id AS "merchantId", number, status,
      period_starts_at AS "periodStartsAt", period_ends_at AS "periodEndsAt",
      issued_at AS "issuedAt", due_at AS "dueAt", subtotal_dzd AS "subtotalDzd",
      tax_rate_basis_points AS "taxRateBasisPoints", tax_dzd AS "taxDzd", total_dzd AS "totalDzd",
      pdf_key IS NOT NULL AS "pdfAvailable"
    FROM public.invoices
    WHERE (${merchantId ?? null}::uuid IS NULL OR merchant_id = ${merchantId ?? null}::uuid)
      AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
      AND (${cursor ?? null}::uuid IS NULL OR id < ${cursor ?? null}::uuid)
    ORDER BY id DESC LIMIT ${limit + 1}
  `.parsers(timestampParsers);
  const { items, nextCursor } = limitPage(rows, limit, ({ invoiceId }) => invoiceId);
  return { invoices: items.map(presentInvoice), nextCursor };
}

async function listTransferProofs(
  sql: TransactionSql,
  { invoiceId, cursor, limit }: TransferProofPage,
) {
  const rows = await sql<TransferProofRow[]>`
    SELECT id AS "transferProofId", invoice_id AS "invoiceId", method, reference,
      proof_media_id AS "proofMediaId", status, submitted_at AS "submittedAt"
    FROM public.billing_transfer_proofs
    WHERE status = 'pending_confirmation'
      AND (${invoiceId ?? null}::uuid IS NULL OR invoice_id = ${invoiceId ?? null}::uuid)
      AND (${cursor ?? null}::uuid IS NULL OR id < ${cursor ?? null}::uuid)
    ORDER BY id DESC LIMIT ${limit + 1}
  `.parsers(timestampParsers);
  const { items, nextCursor } = limitPage(rows, limit, ({ transferProofId }) => transferProofId);
  return {
    transferProofs: items.map((proof) => ({
      ...proof,
      submittedAt: proof.submittedAt.toISOString(),
    })),
    nextCursor,
  };
}

async function readMerchantSubscription(sql: TransactionSql, scope: MenuScope) {
  if (!(await canReadMerchantBilling(sql, scope))) return undefined;
  const { merchantId } = scope;
  const [subscription] = await sql<SubscriptionRow[]>`
    SELECT ${subscriptionColumns(sql)} FROM public.subscriptions WHERE merchant_id = ${merchantId}
  `.parsers(timestampParsers);
  const { subscriptionOnlinePaymentEnabled } = await readBillingSettings(sql);
  return {
    merchantId,
    subscription: subscription ? presentSubscription(subscription) : null,
    subscriptionOnlinePaymentEnabled,
  };
}

export function createBillingRepository({ sql }: DatabaseConnection) {
  const ownerIsolation = "isolation level repeatable read read only";
  return {
    listAdminSubscriptions: (request: SubscriptionPage) =>
      sql.begin((tx) => readAsAdmin(tx, request.adminUserId, () => listSubscriptions(tx, request))),
    listAdminInvoices: (request: InvoicePage & AdminPage) =>
      sql.begin((tx) => readAsAdmin(tx, request.adminUserId, () => listInvoices(tx, request))),
    listAdminTransferProofs: (request: TransferProofPage) =>
      sql.begin((tx) =>
        readAsAdmin(tx, request.adminUserId, () => listTransferProofs(tx, request)),
      ),
    readAdminSettings: (adminUserId: string) =>
      sql.begin((tx) =>
        readAsAdmin(tx, adminUserId, async () => ({ settings: await readBillingSettings(tx) })),
      ),
    readMerchantSubscription: (scope: MenuScope) =>
      sql.begin(ownerIsolation, (tx) => readMerchantSubscription(tx, scope)),
    listMerchantInvoices: (request: MenuScope & BillingPage) =>
      sql.begin(ownerIsolation, async (tx) =>
        (await canReadMerchantBilling(tx, request)) ? listInvoices(tx, request) : undefined,
      ),
  };
}
