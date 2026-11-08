import { expect, test } from "vitest";
import {
  adminBillingInvoiceListQuery,
  adminBillingSettingsInput,
  adminBillingSettingsOutput,
  adminBillingSubscriptionListOutput,
  adminBillingSubscriptionListQuery,
  adminBillingTransferProofListOutput,
  adminBillingTransferProofListQuery,
  adminIssueInvoiceInput,
  adminRecordPaymentInput,
  adminRecordPaymentOutput,
  adminVoidInvoiceInput,
  adminVoidInvoiceOutput,
  billingInvoice,
  billingInvoiceListOutput,
  billingProofMediaOutput,
  billingProofMediaParams,
  billingProofUploadInput,
  billingProofUploadOutput,
  billingSettingsDefaults,
  merchantBillingInvoiceListQuery,
  merchantBillingSubscriptionOutput,
  merchantTransferProofInput,
  merchantTransferProofOutput,
} from "../src/billing.ts";
import { photoUploadMaximumBytes } from "../src/media.ts";

const sessionId = "01932f18-3150-7c33-8a7a-53acfd343001";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343002";
const subscriptionId = "01932f18-3150-7c33-8a7a-53acfd343003";
const invoiceId = "01932f18-3150-7c33-8a7a-53acfd343004";
const proofMediaId = "01932f18-3150-7c33-8a7a-53acfd343005";
const transferProofId = "01932f18-3150-7c33-8a7a-53acfd343006";
const paymentId = "01932f18-3150-7c33-8a7a-53acfd343007";
const issuedAt = "2027-01-21T05:00:00.000Z";
const dueAt = "2027-01-28T05:00:00.000Z";
const period = { startsAt: issuedAt, endsAt: "2027-02-21T05:00:00.000Z" };

const subscription = {
  subscriptionId,
  merchantId,
  status: "trialing",
  priceDzd: 5_000,
  trialEndsAt: issuedAt,
  period: null,
  nextInvoiceAt: issuedAt,
};
const invoice = {
  invoiceId,
  merchantId,
  number: "2027-000123",
  status: "issued",
  period,
  issuedAt,
  dueAt,
  subtotalDzd: 5_000,
  taxRateBasisPoints: 0,
  taxDzd: 0,
  totalDzd: 5_000,
  pdfAvailable: true,
};
const transfer = { method: "baridimob", reference: "BB-123", proofMediaId };
const proofReceipt = {
  ...transfer,
  transferProofId,
  invoiceId,
  status: "pending_confirmation",
  submittedAt: issuedAt,
};

test("[MER-22:contract] owner reads show the plan and its dates, including a suspended plan", () => {
  const result = { sessionId, merchantId, subscription, subscriptionOnlinePaymentEnabled: false };
  expect(merchantBillingSubscriptionOutput.parse(result)).toEqual(result);
  expect(
    merchantBillingSubscriptionOutput.safeParse({ ...result, subscription: null }).success,
  ).toBe(true);
  const suspended = { ...result, subscription: { ...subscription, status: "suspended" } };
  expect(merchantBillingSubscriptionOutput.safeParse(suspended).success).toBe(true);
  for (const invalid of [{ status: "paused" }, { nextInvoiceAt: "tomorrow" }, { priceDzd: 5.5 }]) {
    expect(
      merchantBillingSubscriptionOutput.safeParse({
        ...result,
        subscription: { ...subscription, ...invalid },
      }).success,
    ).toBe(false);
  }
});

test("[MER-22:contract] billing reads use bounded keyset pages and admin suspension filters", () => {
  expect(merchantBillingInvoiceListQuery.parse({})).toEqual({ limit: 50 });
  const query = { cursor: invoiceId, limit: "100" };
  expect(merchantBillingInvoiceListQuery.parse(query)).toEqual({ cursor: invoiceId, limit: 100 });
  expect(adminBillingSubscriptionListQuery.parse({ status: "suspended", merchantId })).toEqual({
    status: "suspended",
    merchantId,
    limit: 50,
  });
  expect(adminBillingInvoiceListQuery.parse({ status: "void", merchantId })).toEqual({
    status: "void",
    merchantId,
    limit: 50,
  });
  for (const invalid of [{ limit: "101" }, { limit: "0" }, { cursor: "123" }, { merchantId }]) {
    expect(merchantBillingInvoiceListQuery.safeParse(invalid).success).toBe(false);
  }
  const page = { sessionId, invoices: [invoice], nextCursor: invoiceId };
  expect(billingInvoiceListOutput.parse(page)).toEqual(page);
  const subscriptions = { sessionId, subscriptions: [subscription], nextCursor: null };
  expect(adminBillingSubscriptionListOutput.parse(subscriptions)).toEqual(subscriptions);
  expect(
    billingInvoiceListOutput.safeParse({
      ...page,
      invoices: Array.from({ length: 101 }, () => invoice),
    }).success,
  ).toBe(false);
});

test("[BIL-04:contract] invoice records show the total, period, number and PDF availability", () => {
  expect(billingInvoice.parse(invoice)).toEqual(invoice);
  const taxed = { ...invoice, taxRateBasisPoints: 100, taxDzd: 50, totalDzd: 5_050 };
  expect(billingInvoice.parse(taxed)).toEqual(taxed);
  for (const invalid of [
    { number: "2027-123" },
    { totalDzd: 5_001 },
    { taxDzd: -1 },
    { taxDzd: 1, totalDzd: 5_001 },
    { subtotalDzd: 2_147_483_648 },
    { period: { ...period, endsAt: period.startsAt } },
    { dueAt: "2027-01-20T05:00:00.000Z" },
    { pdfStorageKey: "private/invoices/invoice.pdf" },
  ]) {
    expect(billingInvoice.safeParse({ ...invoice, ...invalid }).success).toBe(false);
  }
});

test("[ADM-07:contract] admin issuance and voiding require reasons and server-owned invoice fields", () => {
  expect(adminIssueInvoiceInput.parse({ period, reason: "  Invoice missed by job  " })).toEqual({
    period,
    reason: "Invoice missed by job",
  });
  for (const invalid of [
    { period },
    { period, reason: "x", amountDzd: 5_000 },
    { period, reason: "x", number: invoice.number },
    { period, reason: "x", isDemo: true },
    { period: { startsAt: period.endsAt, endsAt: period.startsAt }, reason: "x" },
  ]) {
    expect(adminIssueInvoiceInput.safeParse(invalid).success).toBe(false);
  }
  expect(adminVoidInvoiceInput.parse({ reason: "Duplicate invoice" })).toEqual({
    reason: "Duplicate invoice",
  });
  for (const reason of ["  ", "x\0", "x".repeat(501)]) {
    expect(adminVoidInvoiceInput.safeParse({ reason }).success).toBe(false);
  }
  expect(adminVoidInvoiceInput.safeParse({ reason: "Duplicate", adminId: sessionId }).success).toBe(
    false,
  );
  const voided = { invoiceId, status: "void", voidedAt: issuedAt };
  expect(adminVoidInvoiceOutput.parse(voided)).toEqual(voided);
});

test("[MER-22:contract][BIL-05:contract] invoice proof reserves a private upload with bounded image metadata", () => {
  const request = { contentType: "image/jpeg", bytes: photoUploadMaximumBytes };
  for (const contentType of ["image/jpeg", "image/png", "image/heic", "image/webp"]) {
    expect(billingProofUploadInput.parse({ ...request, contentType })).toEqual({
      ...request,
      contentType,
    });
  }
  for (const invalid of [
    { contentType: "image/svg+xml" },
    { bytes: 0 },
    { bytes: photoUploadMaximumBytes + 1 },
    { bytes: 1.5 },
    { invoiceId },
    { merchantId },
    { kind: "item" },
  ]) {
    expect(billingProofUploadInput.safeParse({ ...request, ...invalid }).success).toBe(false);
  }
  const params = { invoiceId, proofMediaId };
  expect(billingProofMediaParams.parse(params)).toEqual(params);
  expect(billingProofMediaParams.safeParse({ ...params, invoiceId: "public-photo" }).success).toBe(
    false,
  );
  const reservation = { ...params, status: "awaiting_upload", expiresAt: dueAt };
  expect(billingProofUploadOutput.parse(reservation)).toEqual(reservation);
  expect(
    billingProofUploadOutput.safeParse({
      ...reservation,
      publicUrl: "https://example.test",
    }).success,
  ).toBe(false);

  const ready = { ...params, ...request, status: "ready" };
  for (const state of [
    reservation,
    { ...params, status: "preparing" },
    ready,
    { ...params, status: "rejected", reason: "invalid_image" },
  ]) {
    expect(billingProofMediaOutput.parse(state)).toEqual(state);
  }
  for (const invalid of [
    { status: "awaiting_crop" },
    { contentType: "application/pdf" },
    { bytes: undefined },
    { storageKey: "private/receipt.jpg" },
  ]) {
    expect(billingProofMediaOutput.safeParse({ ...ready, ...invalid }).success).toBe(false);
  }
});

test("[MER-22:contract][BIL-05:contract] owner transfer evidence creates a pending submission, separate from payment", () => {
  expect(merchantTransferProofInput.parse({ ...transfer, reference: " BB-123 " })).toEqual(
    transfer,
  );
  expect(merchantTransferProofInput.safeParse({ ...transfer, method: "ccp" }).success).toBe(true);
  for (const invalid of [
    { method: "cash" },
    { method: "chargily" },
    { reference: " " },
    { reference: "CCP\n123" },
    { reference: "CCP\uD800123" },
    { reference: "x".repeat(121) },
    { proofMediaId: "https://example.test/photo.jpg" },
    { amountDzd: 5_000 },
    { status: "confirmed" },
    { confirmedBy: sessionId },
  ]) {
    expect(merchantTransferProofInput.safeParse({ ...transfer, ...invalid }).success).toBe(false);
  }
  expect(merchantTransferProofOutput.parse(proofReceipt)).toEqual(proofReceipt);
  expect(merchantTransferProofOutput.safeParse({ ...proofReceipt, status: "paid" }).success).toBe(
    false,
  );
  expect(adminBillingTransferProofListQuery.parse({ invoiceId })).toEqual({ invoiceId, limit: 50 });
  const queue = { sessionId, transferProofs: [proofReceipt], nextCursor: null };
  expect(adminBillingTransferProofListOutput.parse(queue)).toEqual(queue);
});

test("[ADM-07:contract][BIL-05:contract] audited recording uses manual evidence or a submitted proof", () => {
  const manual = { ...transfer, source: "manual", amountDzd: 5_000, reason: "Receipt verified" };
  for (const method of ["cash", "ccp", "baridimob", "chargily"]) {
    expect(adminRecordPaymentInput.parse({ ...manual, method })).toEqual({ ...manual, method });
  }
  const submitted = {
    source: "transfer_proof",
    transferProofId,
    amountDzd: 5_000,
    reason: "Verified",
  };
  expect(adminRecordPaymentInput.parse(submitted)).toEqual(submitted);
  for (const invalid of [
    { amountDzd: 0 },
    { amountDzd: 1.5 },
    { amountDzd: "5000" },
    { proofMediaId: undefined },
    { reason: undefined },
    { providerEventId: "provider-event" },
    { confirmedBy: sessionId },
  ]) {
    expect(adminRecordPaymentInput.safeParse({ ...manual, ...invalid }).success).toBe(false);
  }
  expect(adminRecordPaymentInput.safeParse({ ...submitted, ...transfer }).success).toBe(false);
  const payment = { paymentId, invoiceId, amountDzd: 5_000, ...transfer, confirmedAt: issuedAt };
  expect(adminRecordPaymentOutput.parse(payment)).toEqual(payment);
});

test("[ADM-08:contract][BIL-01:contract][BIL-04:contract] billing settings keep bounded values and explicit defaults", () => {
  expect(billingSettingsDefaults).toEqual({
    priceDzd: 5_000,
    trialDays: 30,
    dueDays: 7,
    graceDays: 7,
    taxRateBasisPoints: 0,
    legalDetails: null,
    subscriptionOnlinePaymentEnabled: false,
  });
  const initial = { sessionId, settings: billingSettingsDefaults };
  expect(adminBillingSettingsOutput.parse(initial)).toEqual(initial);
  const settings = {
    ...billingSettingsDefaults,
    trialDays: 0,
    legalDetails: {
      companyName: " Exemple SARL ",
      companyAddress: "Alger",
      registrationNumber: null,
      taxId: null,
    },
  };
  const updated = { settings, reason: "Set invoice details" };
  expect(adminBillingSettingsInput.parse(updated).settings.legalDetails?.companyName).toBe(
    "Exemple SARL",
  );
  for (const invalid of [
    { priceDzd: 5_000.1 },
    { priceDzd: 2_147_483_647, taxRateBasisPoints: 1 },
    { trialDays: -1 },
    { dueDays: 0 },
    { graceDays: 366 },
    { taxRateBasisPoints: 10_001 },
    { subscriptionOnlinePaymentEnabled: "true" },
    { legalDetails: { ...settings.legalDetails, companyName: " " } },
    { legalDetails: { ...settings.legalDetails, companyName: "Société\uD800" } },
    { legalDetails: { ...settings.legalDetails, taxId: "123\0" } },
    { onlinePaymentsEnabled: true },
  ]) {
    expect(
      adminBillingSettingsInput.safeParse({ ...updated, settings: { ...settings, ...invalid } })
        .success,
    ).toBe(false);
  }
  expect(adminBillingSettingsInput.safeParse({ settings }).success).toBe(false);
});
