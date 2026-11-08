import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { createBillingRepository, createBillingWriteRepository } from "../src/billing.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();
const id = (serial: number) => `01932f18-3150-7c33-8a7a-${String(serial).padStart(12, "0")}`;
const hash = (value: string) => createHash("sha256").update(value).digest();
const communeId = id(1);
const ownerId = id(2);
const adminId = id(3);
const adminTwoId = id(4);
const merchantId = id(10);
const otherMerchantId = id(11);
const demoMerchantId = id(12);
const settingsClock = new Date("2026-12-31T23:10:00.000Z");
const invoiceClock = new Date("2028-02-01T05:00:00.000Z");
const actionClock = new Date("2028-02-02T05:00:00.000Z");
const reason = "Motif de test";

beforeAll(async () => {
  const { sql } = database.get();
  await sql`INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'تجريبي', 'Test') ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO communes (id, code, wilaya_code, name_ar, name_fr, centroid)
    VALUES (${communeId}, '1699', 16, 'تجريبي', 'Test', ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326))
  `;
  for (const [index, accountId] of [ownerId, adminId, adminTwoId].entries()) {
    await sql`INSERT INTO users (id, phone_e164, created_at)
      VALUES (${accountId}, ${"+21350000000" + String(index)}, ${settingsClock.toISOString()})`;
  }
  await sql`INSERT INTO admins (user_id, totp_secret_encrypted)
    VALUES (${adminId}, ${hash("admin-1")}), (${adminTwoId}, ${hash("admin-2")})`;
  for (const [target, demo] of [
    [merchantId, false],
    [otherMerchantId, false],
    [demoMerchantId, true],
  ] as const) {
    await sql`INSERT INTO merchants (id, slug, restaurant_name, owner_name, phone_e164, commune_id,
      location, cuisines, status, created_at, is_demo)
      VALUES (${target}, ${`fixture-${target}`}, 'Restaurant test', 'Propriétaire fictif', '+213500000000',
        ${communeId}, ST_SetSRID(ST_MakePoint(3.05, 36.76), 4326), ARRAY['algerian'],
        'active', ${settingsClock.toISOString()}, ${demo})`;
    await sql`INSERT INTO subscriptions (merchant_id, status, price_dzd) VALUES (${target}, 'active', 4505)`;
  }
});

function repositories() {
  return {
    read: createBillingRepository(database.get()),
    write: createBillingWriteRepository(database.get()),
  };
}

function command<Input, Scope extends { now: Date }>(scope: Scope, key: string, input: Input) {
  const { now, ...target } = scope;
  return {
    adminUserId: adminId,
    ...target,
    input,
    now,
    idempotencyKeyHash: hash(key),
    requestHash: hash(JSON.stringify({ target, input })),
  };
}

function issue(
  target: string,
  key: string,
  { startsAt, now = invoiceClock }: { startsAt: string; now?: Date },
) {
  return command({ merchantId: target, now }, key, {
    period: { startsAt, endsAt: new Date(Date.parse(startsAt) + 20 * 86_400_000).toISOString() },
    reason,
  });
}

const defaultSettings = {
  priceDzd: 5000,
  trialDays: 30,
  dueDays: 7,
  graceDays: 7,
  taxRateBasisPoints: 0,
  legalDetails: null,
  subscriptionOnlinePaymentEnabled: false,
};

test("[BIL-01:db] authorized settings writes are durable and invoice tax rounds exactly once", async () => {
  const { read, write } = repositories();
  const settings = { ...defaultSettings, priceDzd: 5005, dueDays: 11, taxRateBasisPoints: 1000 };
  const settingsScope = { now: settingsClock };
  const configure = command(settingsScope, "settings", { settings, reason });
  await expect(write.updateSettings({ ...configure, adminUserId: ownerId })).resolves.toEqual({
    kind: "forbidden",
  });
  await expect(write.updateSettings(configure)).resolves.toEqual({
    kind: "applied",
    value: { settings },
  });
  await expect(read.readAdminSettings(adminId)).resolves.toEqual({ settings });
  const { sql } = database.get();
  await sql`UPDATE subscriptions SET price_dzd = 2147483647 WHERE merchant_id = ${otherMerchantId}`;
  const newYear = { startsAt: "2027-01-01T00:00:00.000Z", now: settingsClock };
  await expect(write.issue(issue(otherMerchantId, "overflow", newYear))).resolves.toEqual({
    kind: "invoice_total_out_of_range",
  });
  await sql`UPDATE subscriptions SET price_dzd = 4505 WHERE merchant_id = ${otherMerchantId}`;
  const beforeMidnight = issue(merchantId, "local-year", newYear);
  await expect(write.issue(beforeMidnight)).resolves.toMatchObject({
    kind: "applied",
    value: {
      number: "2027-000001",
      subtotalDzd: 4505,
      taxDzd: 451,
      totalDzd: 4956,
      taxRateBasisPoints: 1000,
      issuedAt: settingsClock.toISOString(),
      dueAt: "2027-01-11T23:10:00.000Z",
      status: "issued",
      pdfAvailable: false,
    },
  });
  await expect(
    write.updateSettings(
      command(settingsScope, "settings-defaults", { settings: defaultSettings, reason }),
    ),
  ).resolves.toEqual({ kind: "applied", value: { settings: defaultSettings } });
  await expect(write.updateSettings(configure)).resolves.toEqual({
    kind: "replayed",
    value: { settings },
  });
  await expect(read.readAdminSettings(adminId)).resolves.toEqual({ settings: defaultSettings });
  await expect(
    write.updateSettings(command(settingsScope, "settings", { settings: defaultSettings, reason })),
  ).resolves.toEqual({ kind: "idempotency_conflict" });
  const audit = await database.get().sql`
    SELECT actor_id, reason, recorded_at = ${settingsClock.toISOString()}::timestamptz AS at_request_time
    FROM billing_command_receipts WHERE operation = 'settings_update'
      AND key_hash = ${configure.idempotencyKeyHash}
  `;
  expect(audit).toEqual([{ actor_id: adminId, reason, at_request_time: true }]);
});

test("[BIL-03:db] [BIL-04:db] issue serializes concurrent retries without numbering gaps on rollback", async () => {
  const { write } = repositories();
  const at = new Date("2029-01-02T05:00:00.000Z");
  const january = { startsAt: "2029-01-01T00:00:00.000Z", now: at };
  const february = { startsAt: "2029-02-01T00:00:00.000Z", now: at };
  const request = issue(merchantId, "retry-issue", january);
  const denied = issue(demoMerchantId, "demo-issue", january);
  await expect(write.issue(denied)).resolves.toEqual({ kind: "invalid_status" });
  await expect(write.issue({ ...request, adminUserId: ownerId })).resolves.toEqual({
    kind: "forbidden",
  });
  const replay = await Promise.all([write.issue(request), write.issue(request)]);
  expect(replay.map(({ kind }) => kind).sort()).toEqual(["applied", "replayed"]);
  for (const result of replay) expect(result).toMatchObject({ value: { number: "2029-000001" } });
  await expect(write.issue(issue(otherMerchantId, "retry-issue", january))).resolves.toEqual({
    kind: "idempotency_conflict",
  });
  const attempts = await Promise.all([
    write.issue(issue(merchantId, "issue-feb-a", february)),
    write.issue({ ...issue(merchantId, "issue-feb-b", february), adminUserId: adminTwoId }),
  ]);
  expect(attempts.map(({ kind }) => kind).sort()).toEqual(["applied", "duplicate_period"]);
  expect(attempts.find(({ kind }) => kind === "applied")).toMatchObject({
    value: { number: "2029-000002" },
  });

  const { sql } = database.get();
  await sql`CREATE FUNCTION reject_fixture_billing_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture billing audit failed'; END $$`;
  await sql`CREATE TRIGGER reject_fixture_billing_audit BEFORE INSERT ON audit_log
    FOR EACH ROW WHEN (NEW.action = 'invoice_issued') EXECUTE FUNCTION reject_fixture_billing_audit()`;
  const next = issue(otherMerchantId, "next-invoice", january);
  try {
    await expect(write.issue(next)).rejects.toThrow(/fixture billing audit failed/u);
  } finally {
    await sql`DROP TRIGGER reject_fixture_billing_audit ON audit_log`;
    await sql`DROP FUNCTION reject_fixture_billing_audit()`;
  }
  await expect(write.issue(next)).resolves.toMatchObject({
    kind: "applied",
    value: { number: "2029-000003" },
  });
  const rows = await sql<
    { number: string }[]
  >`SELECT number FROM invoices WHERE number LIKE '2029-%' ORDER BY number`;
  expect(rows.map(({ number }) => number)).toEqual(["2029-000001", "2029-000002", "2029-000003"]);
  await sql`INSERT INTO invoice_sequences (year, last_value) VALUES (2030, 999999)`;
  const exhausted = issue(merchantId, "exhausted-year", {
    startsAt: "2030-01-01T00:00:00.000Z",
    now: new Date("2030-01-02T00:00:00.000Z"),
  });
  await expect(write.issue(exhausted)).resolves.toEqual({ kind: "invoice_sequence_exhausted" });
});

async function createInvoice(key: string, startsAt: string) {
  const { write } = repositories();
  const created = await write.issue(issue(merchantId, key, { startsAt }));
  if (created.kind !== "applied")
    throw new Error(`Expected invoice issuance, got ${created.kind}.`);
  return created.value;
}

async function readyEvidence(invoiceId: string, serial: number) {
  const proofMediaId = id(serial);
  await database.get().sql`
    INSERT INTO billing_proof_media (id, merchant_id, invoice_id, uploader_id, status, content_type,
      bytes, created_at, expires_at, ready_key, ready_content_type, ready_bytes)
    VALUES (${proofMediaId}, ${merchantId}, ${invoiceId}, ${ownerId}, 'ready', 'image/png', 64,
      ${invoiceClock.toISOString()}, ${actionClock.toISOString()}, ${`proof/${proofMediaId}`}, 'image/webp', 32)
  `;
  return proofMediaId;
}

async function addTransfer(invoiceId: string, proofMediaId: string, serial: number) {
  const transferProofId = id(serial);
  await database.get().sql`
    INSERT INTO billing_transfer_proofs (id, merchant_id, invoice_id, proof_media_id, method, reference, submitted_at)
    VALUES (${transferProofId}, ${merchantId}, ${invoiceId}, ${proofMediaId}, 'ccp', 'CCP-42', ${invoiceClock.toISOString()})
  `;
  return transferProofId;
}

test("[BIL-05:db] concurrent payments confirm only the issued invoice and its selected ready proof", async () => {
  const { write } = repositories();
  const { invoiceId, totalDzd } = await createInvoice(
    "payment-invoice",
    "2028-02-01T00:00:00.000Z",
  );
  const other = await createInvoice("other-evidence-invoice", "2028-03-01T00:00:00.000Z");
  const proofMediaId = await readyEvidence(invoiceId, 40);
  const otherMediaId = await readyEvidence(other.invoiceId, 41);
  const transferProofId = await addTransfer(invoiceId, proofMediaId, 50);
  const unusedProofId = await addTransfer(invoiceId, await readyEvidence(invoiceId, 42), 51);
  const source = {
    source: "transfer_proof",
    transferProofId,
    amountDzd: totalDzd,
    reason,
  } as const;
  const wrongAmount = command({ invoiceId, now: actionClock }, "wrong-amount", {
    ...source,
    amountDzd: totalDzd - 1,
  });
  await expect(write.recordPayment(wrongAmount)).resolves.toEqual({ kind: "amount_mismatch" });
  const wrongMedia = {
    source: "manual",
    method: "cash",
    reference: "CASH-42",
    proofMediaId: otherMediaId,
    amountDzd: totalDzd,
    reason,
  } as const;
  await expect(
    write.recordPayment(command({ invoiceId, now: actionClock }, "wrong-proof", wrongMedia)),
  ).resolves.toEqual({ kind: "proof_unavailable" });
  const requests = [
    command({ invoiceId, now: actionClock }, "payment-first", source),
    {
      ...command({ invoiceId, now: actionClock }, "payment-second", source),
      adminUserId: adminTwoId,
    },
  ];
  const outcomes = await Promise.all(requests.map((request) => write.recordPayment(request)));
  expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["applied", "invalid_status"]);
  const index = outcomes.findIndex(({ kind }) => kind === "applied");
  const result = outcomes[index];
  const request = requests[index];
  if (result?.kind !== "applied" || !request) throw new Error("Expected one confirmed payment.");
  expect(result.value).toMatchObject({
    invoiceId,
    method: "ccp",
    reference: "CCP-42",
    proofMediaId,
    amountDzd: totalDzd,
    confirmedAt: actionClock.toISOString(),
  });
  await expect(write.recordPayment(request)).resolves.toEqual({
    kind: "replayed",
    value: result.value,
  });
  const { sql } = database.get();
  expect(await sql`SELECT status FROM invoices WHERE id = ${invoiceId}`).toEqual([
    { status: "paid" },
  ]);
  expect(
    await sql`SELECT id, status FROM billing_transfer_proofs WHERE invoice_id = ${invoiceId} ORDER BY id`,
  ).toEqual([
    { id: transferProofId, status: "confirmed" },
    { id: unusedProofId, status: "rejected" },
  ]);
  expect(
    await sql`SELECT confirmed_by, transfer_proof_id FROM billing_payments WHERE invoice_id = ${invoiceId}`,
  ).toEqual([{ confirmed_by: request.adminUserId, transfer_proof_id: transferProofId }]);
  expect(
    await sql`SELECT action, actor_id FROM audit_log WHERE action = 'invoice_payment_recorded'`,
  ).toEqual([{ action: "invoice_payment_recorded", actor_id: request.adminUserId }]);
  const manual = command({ invoiceId: other.invoiceId, now: actionClock }, "manual-cash", {
    ...wrongMedia,
    amountDzd: other.totalDzd,
  });
  await expect(write.recordPayment(manual)).resolves.toMatchObject({
    kind: "applied",
    value: { invoiceId: other.invoiceId, method: "cash", proofMediaId: otherMediaId },
  });
});

test("[ADM-07:db] void retires an issued invoice and its pending proof once", async () => {
  const { write } = repositories();
  const { invoiceId } = await createInvoice("void-invoice", "2028-04-01T00:00:00.000Z");
  const proofMediaId = await readyEvidence(invoiceId, 43);
  const transferProofId = await addTransfer(invoiceId, proofMediaId, 52);
  const request = command({ invoiceId, now: actionClock }, "void", { reason });
  const value = { invoiceId, status: "void", voidedAt: actionClock.toISOString() };
  await expect(write.voidInvoice(request)).resolves.toEqual({ kind: "applied", value });
  await expect(write.voidInvoice(request)).resolves.toEqual({ kind: "replayed", value });
  await expect(
    write.voidInvoice(command({ invoiceId, now: actionClock }, "void-again", { reason })),
  ).resolves.toEqual({ kind: "invalid_status" });
  const { sql } = database.get();
  expect(await sql`SELECT status, void_reason FROM invoices WHERE id = ${invoiceId}`).toEqual([
    { status: "void", void_reason: reason },
  ]);
  expect(
    await sql`SELECT status FROM billing_transfer_proofs WHERE id = ${transferProofId}`,
  ).toEqual([{ status: "rejected" }]);
  expect(await sql`SELECT reason FROM audit_log WHERE action = 'invoice_voided'`).toEqual([
    { reason },
  ]);
});

test("[BIL-04:db] rejects an overlapping billing period and allows an adjacent period", async () => {
  const { write } = repositories();
  const now = new Date("2031-02-01T05:00:00.000Z");
  const request = (key: string, startsAt: string, endsAt: string) =>
    command({ merchantId, now }, key, { period: { startsAt, endsAt }, reason });
  const first = request("first-period", "2031-01-01T00:00:00Z", "2031-02-01T00:00:00Z");
  const overlapping = request("overlap", "2031-01-02T00:00:00Z", "2031-02-02T00:00:00Z");
  const adjacent = request("adjacent", "2031-02-01T00:00:00Z", "2031-03-01T00:00:00Z");
  await expect(write.issue(first)).resolves.toMatchObject({
    kind: "applied",
    value: { number: "2031-000001" },
  });
  await expect(write.issue(overlapping)).resolves.toEqual({ kind: "duplicate_period" });
  await expect(write.issue(adjacent)).resolves.toMatchObject({
    kind: "applied",
    value: { number: "2031-000002" },
  });
});
