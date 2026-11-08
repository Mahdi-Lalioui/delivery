import { beforeAll, expect, test } from "vitest";
import { createBillingRepository } from "../src/billing.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const id = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const communeId = id(1);
const ownerId = id(2);
const managerId = id(3);
const outsideId = id(4);
const adminId = id(5);
const blockedAdminId = id(6);
const merchantId = id(10);
const foreignMerchantId = id(11);
const demoMerchantId = id(12);
const newMerchantId = id(13);
const subscriptionId = id(20);
const foreignSubscriptionId = id(21);
const demoSubscriptionId = id(22);
const oldInvoiceId = id(30);
const foreignInvoiceId = id(31);
const invoiceId = id(32);
const proofMediaId = id(40);
const foreignProofMediaId = id(41);
const pendingMediaId = id(42);
const firstProofId = id(50);
const secondProofId = id(51);
const resolvedProofId = id(52);
const periodStarts = "2027-01-31T23:00:00.000Z";
const periodEnds = "2027-02-28T23:00:00.000Z";
const issuedAt = "2027-02-01T05:00:00.000Z";
const dueAt = "2027-02-08T05:00:00.000Z";
const submittedAt = "2027-02-04T12:00:00.000Z";
const pastPeriodStarts = "2026-12-31T23:00:00.000Z";
const owner = { accountId: ownerId, merchantId };
const admin = { adminUserId: adminId, limit: 10 };

const repository = () => createBillingRepository(database.get());

async function seedMerchants() {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'تجريبي', 'Test') ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'تجريبي', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326))
  `;
  for (const [index, accountId] of [
    ownerId,
    managerId,
    outsideId,
    adminId,
    blockedAdminId,
  ].entries()) {
    await sql`INSERT INTO users (id, phone_e164, created_at)
      VALUES (${accountId}, ${"+21350000000" + String(index)}, ${pastPeriodStarts})`;
  }
  await sql`INSERT INTO admins (user_id, totp_secret_encrypted)
    VALUES (${adminId}, ${Buffer.alloc(32, 1)}), (${blockedAdminId}, ${Buffer.alloc(32, 2)})`;
  await sql`UPDATE users SET blocked_at = ${issuedAt} WHERE id = ${blockedAdminId}`;
  for (const [id, merchantOwner, status, demo] of [
    [merchantId, ownerId, "suspended", false],
    [foreignMerchantId, outsideId, "active", false],
    [demoMerchantId, ownerId, "active", true],
    [newMerchantId, ownerId, "approved", false],
  ] as const) {
    await sql`INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at, is_demo)
      VALUES (${id}, ${`fixture-${id}`}, 'Restaurant test', 'Propriétaire fictif', '+213500000000',
        ${communeId}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ARRAY['algerian'],
        ${status}, ${pastPeriodStarts}, ${demo})`;
    await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${id}, ${merchantOwner}, 'owner')`;
  }
  await sql`INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (${merchantId}, ${managerId}, 'manager')`;
}

interface InvoiceFixture {
  readonly id?: string;
  readonly merchantId?: string;
  readonly subscriptionId?: string;
  readonly number?: string;
  readonly status?: string;
  readonly start?: string;
  readonly end?: string;
  readonly dueAt?: string;
  readonly taxRate?: number;
  readonly taxDzd?: number;
  readonly totalDzd?: number;
  readonly pdfKey?: string;
}

function insertInvoice(fixture: InvoiceFixture = {}) {
  const { sql } = database.get();
  const invoice = {
    id: id(99),
    merchantId,
    subscriptionId,
    number: "2027-000099",
    status: "issued",
    start: periodStarts,
    end: periodEnds,
    dueAt,
    taxRate: 0,
    taxDzd: 0,
    totalDzd: 5000,
    pdfKey: null,
    ...fixture,
  };
  return sql`
    INSERT INTO invoices (id, merchant_id, subscription_id, number, status, period_starts_at,
      period_ends_at, issued_at, due_at, subtotal_dzd, tax_rate_basis_points, tax_dzd, total_dzd, pdf_key)
    VALUES (${invoice.id}, ${invoice.merchantId}, ${invoice.subscriptionId}, ${invoice.number},
      ${invoice.status}, ${invoice.start}, ${invoice.end}, ${issuedAt}, ${invoice.dueAt}, 5000,
      ${invoice.taxRate}, ${invoice.taxDzd}, ${invoice.totalDzd}, ${invoice.pdfKey})
  `;
}

async function seedLedger() {
  const { sql } = database.get();
  await sql`
    INSERT INTO subscriptions (id, merchant_id, status, price_dzd, trial_ends_at,
      period_starts_at, period_ends_at, next_invoice_at)
    VALUES (${subscriptionId}, ${merchantId}, 'suspended', 5000, ${periodStarts}, ${periodStarts}, ${periodEnds}, ${periodEnds}),
      (${foreignSubscriptionId}, ${foreignMerchantId}, 'trialing', 5000, ${periodEnds}, NULL, NULL, ${periodEnds}),
      (${demoSubscriptionId}, ${demoMerchantId}, 'active', 5000, NULL, NULL, NULL, NULL)
  `;
  await insertInvoice({
    id: oldInvoiceId,
    number: "2027-000001",
    status: "paid",
    start: pastPeriodStarts,
    end: periodStarts,
  });
  await insertInvoice({
    id: foreignInvoiceId,
    merchantId: foreignMerchantId,
    subscriptionId: foreignSubscriptionId,
    number: "2027-000002",
  });
  await insertInvoice({ id: invoiceId, number: "2027-000003", pdfKey: "private-invoice/fixture" });
  for (const [id, merchant, invoice, uploader] of [
    [proofMediaId, merchantId, invoiceId, ownerId],
    [foreignProofMediaId, foreignMerchantId, foreignInvoiceId, outsideId],
  ] as const) {
    await sql`
      INSERT INTO billing_proof_media (id, merchant_id, invoice_id, uploader_id, status, content_type,
        bytes, created_at, expires_at, ready_key, ready_content_type, ready_bytes)
      VALUES (${id}, ${merchant}, ${invoice}, ${uploader}, 'ready', 'image/png', 64, ${issuedAt},
        ${dueAt}, ${`private-proof/${id}`}, 'image/webp', 32)
    `;
  }
  await sql`
    INSERT INTO billing_proof_media (id, merchant_id, invoice_id, uploader_id, content_type, bytes, created_at, expires_at)
    VALUES (${pendingMediaId}, ${merchantId}, ${invoiceId}, ${ownerId}, 'image/png', 64, ${issuedAt}, ${dueAt})
  `;
  await sql`
    INSERT INTO billing_transfer_proofs (id, merchant_id, invoice_id, proof_media_id, method, reference,
      status, submitted_at, resolved_at)
    VALUES (${firstProofId}, ${merchantId}, ${invoiceId}, ${proofMediaId}, 'ccp', 'CCP-0042',
      'pending_confirmation', ${submittedAt}, NULL),
      (${secondProofId}, ${foreignMerchantId}, ${foreignInvoiceId}, ${foreignProofMediaId}, 'baridimob', 'BM-0042',
       'pending_confirmation', ${submittedAt}, NULL),
      (${resolvedProofId}, ${merchantId}, ${invoiceId}, ${proofMediaId}, 'ccp', 'CCP-0001',
       'rejected', ${submittedAt}, ${dueAt})
  `;
}

beforeAll(async () => {
  await seedMerchants();
  await seedLedger();
});

test("[BIL-01:db] billing settings start with the published defaults and require a live admin", async () => {
  const repo = repository();
  await expect(repo.readAdminSettings(adminId)).resolves.toEqual({
    settings: {
      priceDzd: 5000,
      trialDays: 30,
      dueDays: 7,
      graceDays: 7,
      taxRateBasisPoints: 0,
      legalDetails: null,
      subscriptionOnlinePaymentEnabled: false,
    },
  });
  await expect(repo.readAdminSettings(ownerId)).resolves.toBeUndefined();
  await expect(repo.readAdminSettings(blockedAdminId)).resolves.toBeUndefined();
  const { sql } = database.get();
  await expect(sql`INSERT INTO billing_settings DEFAULT VALUES`).rejects.toMatchObject({
    code: "23505",
  });
  await expect(
    sql`UPDATE billing_settings SET price_dzd = 2147483647, tax_rate_basis_points = 1`,
  ).rejects.toMatchObject({ code: "23514" });
  try {
    await sql`UPDATE billing_settings SET company_name = 'Fixture SARL', company_address = 'Adresse fictive',
      registration_number = 'TEST-01', subscription_online_payment_enabled = true`;
    await expect(repo.readAdminSettings(adminId)).resolves.toMatchObject({
      settings: {
        legalDetails: {
          companyName: "Fixture SARL",
          companyAddress: "Adresse fictive",
          registrationNumber: "TEST-01",
          taxId: null,
        },
        subscriptionOnlinePaymentEnabled: true,
      },
    });
    await expect(repo.readMerchantSubscription(owner)).resolves.toMatchObject({
      subscriptionOnlinePaymentEnabled: true,
    });
  } finally {
    await sql`UPDATE billing_settings SET company_name = NULL, company_address = NULL,
      registration_number = NULL, subscription_online_payment_enabled = false`;
  }
});

test("[BIL-02:db] a suspended owner can read billing while other tenants and managers are denied", async () => {
  const repo = repository();
  await expect(repo.readMerchantSubscription(owner)).resolves.toEqual({
    merchantId,
    subscriptionOnlinePaymentEnabled: false,
    subscription: {
      subscriptionId,
      merchantId,
      status: "suspended",
      priceDzd: 5000,
      trialEndsAt: periodStarts,
      period: { startsAt: periodStarts, endsAt: periodEnds },
      nextInvoiceAt: periodEnds,
    },
  });
  await expect(
    repo.readMerchantSubscription({ ...owner, merchantId: newMerchantId }),
  ).resolves.toEqual({
    merchantId: newMerchantId,
    subscription: null,
    subscriptionOnlinePaymentEnabled: false,
  });
  const first = await repo.listMerchantInvoices({ ...owner, limit: 1 });
  expect(first).toEqual({
    nextCursor: invoiceId,
    invoices: [
      {
        invoiceId,
        merchantId,
        number: "2027-000003",
        status: "issued",
        period: { startsAt: periodStarts, endsAt: periodEnds },
        issuedAt,
        dueAt,
        subtotalDzd: 5000,
        taxRateBasisPoints: 0,
        taxDzd: 0,
        totalDzd: 5000,
        pdfAvailable: true,
      },
    ],
  });
  await expect(
    repo.listMerchantInvoices({ ...owner, cursor: invoiceId, limit: 1 }),
  ).resolves.toMatchObject({
    nextCursor: null,
    invoices: [{ invoiceId: oldInvoiceId, status: "paid", pdfAvailable: false }],
  });
  for (const accountId of [managerId, outsideId]) {
    await expect(repo.readMerchantSubscription({ ...owner, accountId })).resolves.toBeUndefined();
    await expect(
      repo.listMerchantInvoices({ ...owner, accountId, limit: 10 }),
    ).resolves.toBeUndefined();
  }
  await expect(
    repo.listMerchantInvoices({ ...owner, merchantId: foreignMerchantId, limit: 10 }),
  ).resolves.toBeUndefined();
});

test("[BIL-02:db] admin billing reads filter and page by stable IDs without exposing private storage", async () => {
  const repo = repository();
  await expect(repo.listAdminSubscriptions({ ...admin, status: "trialing" })).resolves.toEqual({
    nextCursor: null,
    subscriptions: [
      {
        subscriptionId: foreignSubscriptionId,
        merchantId: foreignMerchantId,
        status: "trialing",
        priceDzd: 5000,
        trialEndsAt: periodEnds,
        period: null,
        nextInvoiceAt: periodEnds,
      },
    ],
  });
  await expect(repo.listAdminSubscriptions({ ...admin, merchantId })).resolves.toMatchObject({
    nextCursor: null,
    subscriptions: [{ subscriptionId }],
  });
  const first = await repo.listAdminInvoices({ ...admin, status: "issued", limit: 1 });
  expect(first).toMatchObject({ nextCursor: invoiceId, invoices: [{ invoiceId }] });
  await expect(
    repo.listAdminInvoices({ ...admin, status: "issued", cursor: invoiceId, limit: 1 }),
  ).resolves.toMatchObject({
    nextCursor: null,
    invoices: [{ invoiceId: foreignInvoiceId }],
  });
  await expect(
    repo.listAdminInvoices({ ...admin, merchantId, status: "paid" }),
  ).resolves.toMatchObject({
    nextCursor: null,
    invoices: [{ invoiceId: oldInvoiceId }],
  });
  await expect(repo.listAdminTransferProofs({ ...admin, limit: 1 })).resolves.toMatchObject({
    nextCursor: secondProofId,
    transferProofs: [{ transferProofId: secondProofId }],
  });
  await expect(repo.listAdminTransferProofs({ ...admin, invoiceId })).resolves.toEqual({
    nextCursor: null,
    transferProofs: [
      {
        transferProofId: firstProofId,
        invoiceId,
        method: "ccp",
        reference: "CCP-0042",
        proofMediaId,
        status: "pending_confirmation",
        submittedAt,
      },
    ],
  });
  const unauthorized = { ...admin, adminUserId: ownerId };
  await expect(repo.listAdminSubscriptions(unauthorized)).resolves.toBeUndefined();
  await expect(repo.listAdminInvoices(unauthorized)).resolves.toBeUndefined();
  await expect(repo.listAdminTransferProofs(unauthorized)).resolves.toBeUndefined();
});

test("[BIL-03:db] [BIL-04:db] [BIL-06:db] invoice constraints preserve money, periods and demo exclusion", async () => {
  await expect(insertInvoice()).rejects.toMatchObject({ code: "23505" });
  await expect(insertInvoice({ totalDzd: 4999 })).rejects.toMatchObject({ code: "23514" });
  await expect(insertInvoice({ taxDzd: 1, totalDzd: 5001 })).rejects.toMatchObject({
    code: "23514",
  });
  await expect(insertInvoice({ dueAt: issuedAt })).rejects.toMatchObject({ code: "23514" });
  await expect(insertInvoice({ end: periodStarts })).rejects.toMatchObject({ code: "23514" });
  await expect(insertInvoice({ status: "void" })).rejects.toMatchObject({ code: "23514" });
  await expect(
    insertInvoice({ merchantId: demoMerchantId, subscriptionId: demoSubscriptionId }),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    insertInvoice({
      merchantId: foreignMerchantId,
      subscriptionId,
      start: periodEnds,
      end: "2027-03-31T23:00:00.000Z",
    }),
  ).rejects.toMatchObject({ code: "23503" });
  const { sql } = database.get();
  await sql`INSERT INTO invoice_reminders (invoice_id, day, sent_at) VALUES (${invoiceId}, 5, ${submittedAt})`;
  await expect(
    sql`INSERT INTO invoice_reminders (invoice_id, day, sent_at) VALUES (${invoiceId}, 5, ${submittedAt})`,
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    sql`INSERT INTO invoice_reminders (invoice_id, day, sent_at) VALUES (${invoiceId}, 6, ${submittedAt})`,
  ).rejects.toMatchObject({ code: "23514" });
});

test("[BIL-05:db] transfer evidence must be ready and scoped to the invoice, and provider events are unique", async () => {
  const { sql } = database.get();
  for (const invalid of [pendingMediaId, foreignProofMediaId]) {
    await expect(sql`
      INSERT INTO billing_transfer_proofs (merchant_id, invoice_id, proof_media_id, method, reference, submitted_at)
      VALUES (${merchantId}, ${invoiceId}, ${invalid}, 'ccp', 'CCP-invalid', ${submittedAt})
    `).rejects.toMatchObject({ code: "23503" });
  }
  await expect(sql`
    INSERT INTO billing_transfer_proofs (merchant_id, invoice_id, proof_media_id, method, reference, submitted_at)
    VALUES (${merchantId}, ${oldInvoiceId}, ${proofMediaId}, 'ccp', 'CCP-invalid', ${submittedAt})
  `).rejects.toMatchObject({ code: "23503" });
  await sql`
    INSERT INTO billing_payments (merchant_id, invoice_id, method, reference, amount_dzd, provider_event_id, confirmed_at)
    VALUES (${merchantId}, ${invoiceId}, 'chargily', 'Fixture event', 5000, 'event-42', ${submittedAt})
  `;
  await expect(sql`
    INSERT INTO billing_payments (merchant_id, invoice_id, method, reference, amount_dzd, provider_event_id, confirmed_at)
    VALUES (${foreignMerchantId}, ${foreignInvoiceId}, 'chargily', 'Fixture event', 5000, 'event-42', ${submittedAt})
  `).rejects.toMatchObject({ code: "23505" });
  await sql`
    INSERT INTO billing_payments (merchant_id, invoice_id, method, reference, amount_dzd, proof_media_id, confirmed_at)
    VALUES (${merchantId}, ${invoiceId}, 'cash', 'Fixture cash receipt', 5000, ${proofMediaId}, ${submittedAt})
  `;
  await expect(sql`
    INSERT INTO billing_payments (merchant_id, invoice_id, method, reference, amount_dzd, proof_media_id, confirmed_at)
    VALUES (${merchantId}, ${invoiceId}, 'cash', 'Fixture cash receipt', 5000, ${foreignProofMediaId}, ${submittedAt})
  `).rejects.toMatchObject({ code: "23503" });
});
