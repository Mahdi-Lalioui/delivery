import type {
  adminRecordPaymentInput,
  adminRecordPaymentOutput,
  adminVoidInvoiceInput,
  adminVoidInvoiceOutput,
} from "@zaafran/contracts/billing";
import type { TransactionSql } from "postgres";
import { auditInvoice, type BillingChange, type BillingWriteRequest } from "./billing-command.js";

type VoidInput = ReturnType<typeof adminVoidInvoiceInput.parse>;
type PaymentInput = ReturnType<typeof adminRecordPaymentInput.parse>;
type Payment = ReturnType<typeof adminRecordPaymentOutput.parse>;
type VoidedInvoice = ReturnType<typeof adminVoidInvoiceOutput.parse>;

type InvoiceRequest<Input> = BillingWriteRequest<Input> & { readonly invoiceId: string };
type InvoiceDecision<Input> = InvoiceRequest<Input> & { readonly actorId: string };
export type VoidInvoiceRequest = InvoiceRequest<VoidInput>;
export type RecordPaymentRequest = InvoiceRequest<PaymentInput>;

interface InvoiceScope {
  readonly merchantId: string;
  readonly invoiceId: string;
}

type PaymentEvidence = Pick<Payment, "method" | "reference" | "proofMediaId"> & {
  readonly transferProofId: string | null;
};

async function lockInvoice(
  sql: TransactionSql,
  { invoiceId, now }: { invoiceId: string; now: Date },
) {
  const [invoice] = await sql<(InvoiceScope & { totalDzd: number; canSettle: boolean })[]>`
    SELECT id AS "invoiceId", merchant_id AS "merchantId", total_dzd AS "totalDzd",
      (status = 'issued' AND issued_at <= ${now.toISOString()}::timestamptz) AS "canSettle"
    FROM public.invoices WHERE id = ${invoiceId} FOR NO KEY UPDATE
  `;
  return invoice;
}

async function lockPaymentEvidence(
  sql: TransactionSql,
  { merchantId, invoiceId }: InvoiceScope,
  { input, now }: InvoiceDecision<PaymentInput>,
): Promise<PaymentEvidence | undefined> {
  if (input.source === "transfer_proof") {
    const [proof] = await sql<PaymentEvidence[]>`
      SELECT id AS "transferProofId", proof_media_id AS "proofMediaId", method, reference
      FROM public.billing_transfer_proofs
      WHERE merchant_id = ${merchantId} AND invoice_id = ${invoiceId} AND id = ${input.transferProofId}
        AND status = 'pending_confirmation' AND submitted_at <= ${now.toISOString()}::timestamptz
      FOR NO KEY UPDATE
    `;
    return proof;
  }

  const [proof] = await sql<{ proofMediaId: string }[]>`
    SELECT id AS "proofMediaId" FROM public.billing_proof_media
    WHERE merchant_id = ${merchantId} AND invoice_id = ${invoiceId} AND id = ${input.proofMediaId}
      AND status = 'ready'
    FOR SHARE
  `;
  return (
    proof && { ...proof, method: input.method, reference: input.reference, transferProofId: null }
  );
}

async function resolvePendingProofs(
  sql: TransactionSql,
  { merchantId, invoiceId }: InvoiceScope,
  { selectedId, now }: { selectedId: string | null; now: Date },
) {
  await sql`
    UPDATE public.billing_transfer_proofs
    SET status = CASE WHEN id = ${selectedId}::uuid THEN 'confirmed' ELSE 'rejected' END,
      resolved_at = greatest(submitted_at, ${now.toISOString()}::timestamptz)
    WHERE merchant_id = ${merchantId} AND invoice_id = ${invoiceId} AND status = 'pending_confirmation'
  `;
}

export async function voidBillingInvoice(
  sql: TransactionSql,
  request: InvoiceDecision<VoidInput>,
): Promise<BillingChange<VoidedInvoice>> {
  const { actorId, input, now } = request;
  const invoice = await lockInvoice(sql, request);
  if (!invoice) return { kind: "not_found" };
  if (!invoice.canSettle) return { kind: "invalid_status" };
  const { invoiceId, merchantId } = invoice;
  const voidedAt = now.toISOString();
  await sql`
    UPDATE public.invoices SET status = 'void', void_reason = ${input.reason}, voided_at = ${voidedAt}
    WHERE merchant_id = ${merchantId} AND id = ${invoiceId}
  `;
  await resolvePendingProofs(sql, invoice, { selectedId: null, now });
  await auditInvoice(sql, {
    actorId,
    merchantId,
    action: "invoice_voided",
    reason: input.reason,
    now,
  });
  return { kind: "applied", value: { invoiceId, status: "void", voidedAt } };
}

export async function recordBillingPayment(
  sql: TransactionSql,
  request: InvoiceDecision<PaymentInput>,
): Promise<BillingChange<Payment>> {
  const { actorId, input, now } = request;
  const invoice = await lockInvoice(sql, request);
  if (!invoice) return { kind: "not_found" };
  if (!invoice.canSettle) return { kind: "invalid_status" };
  const { merchantId, invoiceId, totalDzd } = invoice;
  if (input.amountDzd !== totalDzd) return { kind: "amount_mismatch" };
  const evidence = await lockPaymentEvidence(sql, invoice, request);
  if (!evidence) return { kind: "proof_unavailable" };

  const { method, reference, proofMediaId, transferProofId } = evidence;
  const confirmedAt = now.toISOString();
  const [payment] = await sql<{ paymentId: string }[]>`
    INSERT INTO public.billing_payments
      (merchant_id, invoice_id, proof_media_id, transfer_proof_id, method, reference, amount_dzd, confirmed_by, confirmed_at)
    VALUES (${merchantId}, ${invoiceId}, ${proofMediaId}, ${transferProofId}, ${method},
      ${reference}, ${totalDzd}, ${actorId}, ${confirmedAt}) RETURNING id AS "paymentId"
  `;
  if (!payment) throw new Error("Payment insert returned no row.");
  await sql`UPDATE public.invoices SET status = 'paid' WHERE merchant_id = ${merchantId} AND id = ${invoiceId}`;
  await resolvePendingProofs(sql, invoice, { selectedId: transferProofId, now });
  await auditInvoice(sql, {
    actorId,
    merchantId,
    action: "invoice_payment_recorded",
    reason: input.reason,
    now,
  });
  return {
    kind: "applied",
    value: {
      ...payment,
      invoiceId,
      method,
      reference,
      proofMediaId,
      amountDzd: totalDzd,
      confirmedAt,
    },
  };
}
