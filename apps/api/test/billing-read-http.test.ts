import { billingSettingsDefaults } from "@zaafran/contracts/billing";
import type { createBillingRepository } from "@zaafran/db/billing";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createBillingRepository>;

const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const invoiceId = "01932f18-3150-7c33-8a7a-53acfd343004";
const admin = { role: "admin", accountId, sessionId } as const;
const owner = { ...admin, role: "merchant_owner" } as const;
const root = "/v1/admin/billing";
const merchant = `/v1/merchants/${merchantId}`;

function setup(actor?: Actor) {
  const repository = {
    listAdminSubscriptions: vi.fn<Repository["listAdminSubscriptions"]>(),
    listAdminInvoices: vi.fn<Repository["listAdminInvoices"]>(),
    listAdminTransferProofs: vi.fn<Repository["listAdminTransferProofs"]>(),
    readAdminSettings: vi.fn<Repository["readAdminSettings"]>(),
    readMerchantSubscription: vi.fn<Repository["readMerchantSubscription"]>(),
    listMerchantInvoices: vi.fn<Repository["listMerchantInvoices"]>(),
  } satisfies Repository;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    billing: repository,
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[ADM-07:http] the admin reads typed billing pages and the same settings singleton", async () => {
  const { api, repository } = setup(admin);
  repository.listAdminSubscriptions.mockResolvedValue({ subscriptions: [], nextCursor: null });
  repository.listAdminInvoices.mockResolvedValue({ invoices: [], nextCursor: null });
  repository.listAdminTransferProofs.mockResolvedValue({ transferProofs: [], nextCursor: null });
  repository.readAdminSettings.mockResolvedValue({ settings: billingSettingsDefaults });
  for (const [url, body] of [
    [
      `${root}/subscriptions?status=trialing&merchantId=${merchantId}`,
      { subscriptions: [], nextCursor: null },
    ],
    [`${root}/invoices?status=issued&limit=10`, { invoices: [], nextCursor: null }],
    [`${root}/transfer-proofs?invoiceId=${invoiceId}`, { transferProofs: [], nextCursor: null }],
    [`${root}/settings`, { settings: billingSettingsDefaults }],
  ] as const) {
    const response = await api.inject(url);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ ...body, sessionId });
  }
  expect(repository.listAdminSubscriptions).toHaveBeenCalledExactlyOnceWith({
    adminUserId: accountId,
    merchantId,
    status: "trialing",
    limit: 50,
  });
  expect(repository.listAdminInvoices).toHaveBeenCalledExactlyOnceWith({
    adminUserId: accountId,
    status: "issued",
    limit: 10,
  });
  expect(repository.listAdminTransferProofs).toHaveBeenCalledExactlyOnceWith({
    adminUserId: accountId,
    invoiceId,
    limit: 50,
  });
  expect(repository.readAdminSettings).toHaveBeenCalledExactlyOnceWith(accountId);
});

test("[MER-22:http] scopes billing and invoices to the current owner's restaurant", async () => {
  const { api, repository } = setup(owner);
  repository.readMerchantSubscription.mockResolvedValue({
    merchantId,
    subscription: null,
    subscriptionOnlinePaymentEnabled: false,
  });
  repository.listMerchantInvoices.mockResolvedValue({ invoices: [], nextCursor: null });
  const billing = await api.inject(merchant + "/billing");
  const invoices = await api.inject(merchant + "/invoices?cursor=" + invoiceId);
  expect(billing.statusCode).toBe(200);
  expect(invoices.statusCode).toBe(200);
  expect(invoices.json()).toEqual({ invoices: [], nextCursor: null, sessionId });
  expect(repository.readMerchantSubscription).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
  });
  expect(repository.listMerchantInvoices).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    limit: 50,
    cursor: invoiceId,
  });
  expect((await api.inject(root + "/invoices")).statusCode).toBe(403);
  expect(repository.listAdminInvoices).not.toHaveBeenCalled();
});

test("[MER-22:http] denies staff at the policy and unrelated owners at the scoped repository", async () => {
  const staff = setup({ ...owner, role: "merchant_staff" });
  expect((await staff.api.inject(merchant + "/billing")).statusCode).toBe(403);
  expect(staff.repository.readMerchantSubscription).not.toHaveBeenCalled();
  const other = setup(owner);
  other.repository.readMerchantSubscription.mockResolvedValue(undefined);
  expect((await other.api.inject(merchant + "/billing")).statusCode).toBe(404);
});
