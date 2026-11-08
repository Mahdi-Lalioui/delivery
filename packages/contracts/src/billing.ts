import { z } from "zod";
import { adminMerchantReviewInput } from "./admin.js";
import { photoUploadMaximumBytes } from "./media.js";
import { pageLimit } from "./pagination.js";

const uuid = z.uuid();
const instant = z.iso.datetime();
const maximumDzd = 2_147_483_647;
const wholeDzd = z.int().min(0).max(maximumDzd);
const positiveDzd = wholeDzd.min(1);
const basisPointsPerWhole = 10_000;
const taxRateBasisPoints = z.int().min(0).max(basisPointsPerWhole);
const reason = adminMerchantReviewInput.shape.reason;

const subscriptionStatus = z.enum(["trialing", "active", "past_due", "suspended", "cancelled"]);
const invoiceStatus = z.enum(["issued", "paid", "void"]);
const billingPeriod = z
  .strictObject({ startsAt: instant, endsAt: instant })
  .refine(({ startsAt, endsAt }) => Date.parse(startsAt) < Date.parse(endsAt), {
    path: ["endsAt"],
    message: "The billing period must end after it starts.",
  });

const billingSubscription = z.strictObject({
  subscriptionId: uuid,
  merchantId: uuid,
  status: subscriptionStatus,
  priceDzd: positiveDzd,
  trialEndsAt: instant.nullable(),
  period: billingPeriod.nullable(),
  nextInvoiceAt: instant.nullable(),
});

export const billingInvoice = z
  .strictObject({
    invoiceId: uuid,
    merchantId: uuid,
    number: z.string().regex(/^[0-9]{4}-[0-9]{6}$/),
    status: invoiceStatus,
    period: billingPeriod,
    issuedAt: instant,
    dueAt: instant,
    subtotalDzd: positiveDzd,
    taxRateBasisPoints,
    taxDzd: wholeDzd,
    totalDzd: positiveDzd,
    pdfAvailable: z.boolean(),
  })
  .refine(({ subtotalDzd, taxDzd, totalDzd }) => subtotalDzd + taxDzd === totalDzd, {
    path: ["totalDzd"],
    message: "The total must equal the subtotal plus tax.",
  })
  .refine(({ taxRateBasisPoints, taxDzd }) => taxRateBasisPoints > 0 || taxDzd === 0, {
    path: ["taxDzd"],
    message: "A zero tax rate requires a zero tax amount.",
  })
  .refine(({ issuedAt, dueAt }) => Date.parse(issuedAt) < Date.parse(dueAt), {
    path: ["dueAt"],
    message: "The due date must follow issuance.",
  });

// Each page uses the UUIDv7 id of its last row as the cursor.
const billingPageQuery = z.strictObject({ cursor: uuid.optional(), limit: pageLimit });
const billingPageOutput = z.strictObject({ sessionId: uuid, nextCursor: uuid.nullable() });

export const merchantBillingSubscriptionOutput = z.strictObject({
  sessionId: uuid,
  merchantId: uuid,
  subscription: billingSubscription.nullable(),
  subscriptionOnlinePaymentEnabled: z.boolean(),
});

export const merchantBillingInvoiceListQuery = billingPageQuery;
export const billingInvoiceListOutput = billingPageOutput.extend({
  invoices: z.array(billingInvoice).max(100),
});

export const adminBillingSubscriptionListQuery = billingPageQuery.extend({
  merchantId: uuid.optional(),
  status: subscriptionStatus.optional(),
});
export const adminBillingSubscriptionListOutput = billingPageOutput.extend({
  subscriptions: z.array(billingSubscription).max(100),
});
export const adminBillingInvoiceListQuery = billingPageQuery.extend({
  merchantId: uuid.optional(),
  status: invoiceStatus.optional(),
});

const billingProofPhoto = {
  contentType: z.enum(["image/jpeg", "image/png", "image/heic", "image/webp"]),
  bytes: z.int().positive().max(photoUploadMaximumBytes),
};

/** The invoice is in the path. Its merchant owner or a billing admin can reserve and upload proof. */
export const billingProofUploadInput = z.strictObject(billingProofPhoto);
export const billingProofMediaParams = z.strictObject({ invoiceId: uuid, proofMediaId: uuid });
export const billingProofUploadOutput = billingProofMediaParams.extend({
  status: z.literal("awaiting_upload"),
  expiresAt: instant,
});

/** Serve status and private content to the invoice's merchant owner or a billing admin. */
export const billingProofMediaOutput = z.discriminatedUnion("status", [
  billingProofUploadOutput,
  billingProofMediaParams.extend({ status: z.literal("preparing") }),
  billingProofMediaParams.extend({ status: z.literal("ready"), ...billingProofPhoto }),
  billingProofMediaParams.extend({
    status: z.literal("rejected"),
    reason: z.enum(["upload_expired", "content_type_mismatch", "invalid_image", "image_too_large"]),
  }),
]);

const transferMethod = z.enum(["ccp", "baridimob"]);
const paymentMethod = z.enum(["cash", ...transferMethod.options, "chargily"]);
const paymentEvidence = {
  reference: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\p{Cc}\p{Cs}\p{Zl}\p{Zp}]+$/u),
  // Look up ready private proof by merchant and invoice. Exclude general media uploads.
  proofMediaId: uuid,
};

/** MER-22: an owner submits photo evidence for a transfer against an invoice. */
export const merchantTransferProofInput = z.strictObject({
  method: transferMethod,
  ...paymentEvidence,
});
export const merchantTransferProofOutput = merchantTransferProofInput.extend({
  transferProofId: uuid,
  invoiceId: uuid,
  status: z.literal("pending_confirmation"),
  submittedAt: instant,
});

export const adminBillingTransferProofListQuery = billingPageQuery.extend({
  invoiceId: uuid.optional(),
});
export const adminBillingTransferProofListOutput = billingPageOutput.extend({
  transferProofs: z.array(merchantTransferProofOutput).max(100),
});

/** ADM-07: the server derives the invoice amounts and number for the subscription and period. */
export const adminIssueInvoiceInput = z.strictObject({ period: billingPeriod, reason });

export const adminVoidInvoiceInput = z.strictObject({ reason });
export const adminVoidInvoiceOutput = z.strictObject({
  invoiceId: uuid,
  status: z.literal("void"),
  voidedAt: instant,
});

/** A submitted transfer uses the evidence already stored against the invoice. */
export const adminRecordPaymentInput = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("manual"),
    method: paymentMethod,
    ...paymentEvidence,
    amountDzd: positiveDzd,
    reason,
  }),
  z.strictObject({
    source: z.literal("transfer_proof"),
    transferProofId: uuid,
    amountDzd: positiveDzd,
    reason,
  }),
]);
export const adminRecordPaymentOutput = z.strictObject({
  paymentId: uuid,
  invoiceId: uuid,
  method: paymentMethod,
  ...paymentEvidence,
  amountDzd: positiveDzd,
  confirmedAt: instant,
});

const legalText = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !value.includes("\0") && !/\p{Cs}/u.test(value));
const legalDetails = z.strictObject({
  companyName: legalText.max(200),
  companyAddress: legalText.max(500),
  registrationNumber: legalText.max(120).nullable(),
  taxId: legalText.max(120).nullable(),
});
const billingSettings = z
  .strictObject({
    priceDzd: positiveDzd,
    trialDays: z.int().min(0).max(365),
    dueDays: z.int().min(1).max(365),
    graceDays: z.int().min(0).max(365),
    taxRateBasisPoints,
    legalDetails: legalDetails.nullable(),
    subscriptionOnlinePaymentEnabled: z.boolean(),
  })
  .refine(
    (settings) => {
      // Allow any whole-DZD tax rounding policy without overflowing the invoice total.
      const maximumTaxDzd = Math.ceil(
        (settings.priceDzd * settings.taxRateBasisPoints) / basisPointsPerWhole,
      );
      return settings.priceDzd + maximumTaxDzd <= maximumDzd;
    },
    { path: ["priceDzd"], message: "The price including tax exceeds the invoice limit." },
  );

export const billingSettingsDefaults = {
  priceDzd: 5_000,
  trialDays: 30,
  dueDays: 7,
  graceDays: 7,
  taxRateBasisPoints: 0,
  legalDetails: null,
  subscriptionOnlinePaymentEnabled: false,
} satisfies z.output<typeof billingSettings>;

export const adminBillingSettingsInput = z.strictObject({ settings: billingSettings, reason });
export const adminBillingSettingsOutput = z.strictObject({
  sessionId: uuid,
  settings: billingSettings,
});
