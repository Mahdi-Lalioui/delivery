import {
  billingInvoiceListOutput,
  merchantBillingSubscriptionOutput,
} from "@zaafran/contracts/billing";
import { merchantPromotionOutput } from "@zaafran/contracts/promotions";
import { merchantReviewPageOutput } from "@zaafran/contracts/ratings";

// Design-gallery fixtures. Parsed with the published contract, so the gallery never shows a shape
// the API cannot send. Fictional data only.

const merchantId = "019d6abc-0000-7000-8000-000000000002";
const sessionId = "019d6abc-0000-7000-8000-000000000001";
const period = { startsAt: "2027-01-31T23:00:00.000Z", endsAt: "2027-02-28T23:00:00.000Z" };

function invoice(index: number, status: "issued" | "paid" | "void") {
  return {
    invoiceId: `019d6abc-0000-7000-8000-00000000010${String(index)}`,
    merchantId,
    number: `2027-00000${String(index)}`,
    status,
    period,
    issuedAt: period.startsAt,
    dueAt: "2027-02-07T23:00:00.000Z",
    subtotalDzd: 5000,
    taxRateBasisPoints: 0,
    taxDzd: 0,
    totalDzd: 5000,
    pdfAvailable: true,
  };
}

export const galleryInvoices = billingInvoiceListOutput.parse({
  sessionId,
  nextCursor: null,
  invoices: [invoice(3, "issued"), invoice(2, "paid"), invoice(1, "void")],
}).invoices;

export const gallerySubscription = merchantBillingSubscriptionOutput.parse({
  sessionId,
  merchantId,
  subscriptionOnlinePaymentEnabled: false,
  subscription: {
    subscriptionId: "019d6abc-0000-7000-8000-000000000003",
    merchantId,
    status: "past_due",
    priceDzd: 5000,
    trialEndsAt: "2027-01-31T23:00:00.000Z",
    period,
    nextInvoiceAt: period.endsAt,
  },
}).subscription;

export const galleryTransfer = {
  transferProofId: "019d6abc-0000-7000-8000-000000000006",
  invoiceId: "019d6abc-0000-7000-8000-000000000103",
  method: "baridimob" as const,
  reference: "BM-2027-0042",
  proofMediaId: "019d6abc-0000-7000-8000-000000000007",
  status: "pending_confirmation" as const,
  submittedAt: "2027-02-08T09:00:00.000Z",
};

export const galleryMerchantId = merchantId;

export const galleryPromotions = [
  merchantPromotionOutput.parse({
    promotionId: "019d6abc-0000-7000-8000-000000000201",
    merchantId,
    activation: { kind: "code", code: "IFTAR10" },
    discount: { kind: "percent", basisPoints: 1000, capDzd: 300 },
    conditions: { minimumSubtotalDzd: 1500 },
    stats: { uses: 42, salesDzd: 98_500 },
  }),
  merchantPromotionOutput.parse({
    promotionId: "019d6abc-0000-7000-8000-000000000202",
    merchantId,
    activation: { kind: "automatic" },
    discount: { kind: "free_delivery" },
    conditions: { minimumSubtotalDzd: 3000 },
    stats: { uses: 17, salesDzd: 61_200 },
  }),
];

const reviewBase = { createdAt: "2027-02-08T20:00:00.000Z", reply: null };

export const galleryReviews = merchantReviewPageOutput.parse({
  nextCursor: null,
  reviews: [
    {
      ...reviewBase,
      ratingId: "019d6abc-0000-7000-8000-000000000301",
      foodStars: 5,
      deliveryStars: 4,
      comment: "Couscous excellent, livré chaud. Le livreur était très aimable.",
    },
    {
      ...reviewBase,
      ratingId: "019d6abc-0000-7000-8000-000000000302",
      foodStars: 3,
      deliveryStars: null,
      comment: "Bon mais un peu salé cette fois.",
      reply: {
        body: "Merci, nous avons ajusté la recette.",
        createdAt: "2027-02-08T21:00:00.000Z",
        editableUntil: "2026-01-01T00:00:00.000Z",
      },
    },
  ],
}).reviews;
