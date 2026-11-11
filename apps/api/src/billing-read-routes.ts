import {
  adminBillingInvoiceListQuery,
  adminBillingSettingsOutput,
  adminBillingSubscriptionListOutput,
  adminBillingSubscriptionListQuery,
  adminBillingTransferProofListOutput,
  adminBillingTransferProofListQuery,
  billingInvoiceListOutput,
  merchantBillingInvoiceListQuery,
  merchantBillingSubscriptionOutput,
} from "@zaafran/contracts/billing";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { createBillingRepository } from "@zaafran/db/billing";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export type BillingRepository = ReturnType<typeof createBillingRepository>;

const admin = { policy: { kind: "roles", roles: ["admin"] } } as const;
const owner = { policy: { kind: "roles", roles: ["customer", "merchant_owner"] } } as const;
const merchantParams = z.strictObject({ merchantId: z.uuid() });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function pageArgs({ cursor, limit }: { cursor?: string | undefined; limit: number }) {
  return { limit, ...(cursor === undefined ? {} : { cursor: cursor.toLowerCase() }) };
}

async function readBilling({
  request,
  reply,
  repository,
  denied,
  read,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  repository: BillingRepository | undefined;
  denied: 403 | 404;
  read: (repository: BillingRepository, accountId: string) => Promise<object | undefined>;
}) {
  const actor = getRequestActor(request);
  if (!actor) return sendProblem(reply, 401);
  if (!repository) return sendProblem(reply, 503);
  reply.header("cache-control", "no-store");
  const result = await read(repository, actor.accountId);
  return result
    ? reply.send({ ...result, sessionId: actor.sessionId })
    : sendProblem(reply, denied);
}

function registerAdminBillingReads(api: FastifyInstance, repository?: BillingRepository) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  const base = "/v1/admin/billing";
  routes.get(
    base + "/subscriptions",
    {
      config: admin,
      schema: {
        querystring: adminBillingSubscriptionListQuery,
        response: { 200: adminBillingSubscriptionListOutput, ...errors },
      },
    },
    (request, reply) =>
      readBilling({
        request,
        reply,
        repository,
        denied: 403,
        read: (repo, adminUserId) => {
          const { merchantId, status } = request.query;
          return repo.listAdminSubscriptions({
            ...pageArgs(request.query),
            adminUserId,
            ...(merchantId === undefined ? {} : { merchantId: merchantId.toLowerCase() }),
            ...(status === undefined ? {} : { status }),
          });
        },
      }),
  );
  routes.get(
    base + "/invoices",
    {
      config: admin,
      schema: {
        querystring: adminBillingInvoiceListQuery,
        response: { 200: billingInvoiceListOutput, ...errors },
      },
    },
    (request, reply) =>
      readBilling({
        request,
        reply,
        repository,
        denied: 403,
        read: (repo, adminUserId) => {
          const { merchantId, status } = request.query;
          return repo.listAdminInvoices({
            ...pageArgs(request.query),
            adminUserId,
            ...(merchantId === undefined ? {} : { merchantId: merchantId.toLowerCase() }),
            ...(status === undefined ? {} : { status }),
          });
        },
      }),
  );
  routes.get(
    base + "/transfer-proofs",
    {
      config: admin,
      schema: {
        querystring: adminBillingTransferProofListQuery,
        response: { 200: adminBillingTransferProofListOutput, ...errors },
      },
    },
    (request, reply) =>
      readBilling({
        request,
        reply,
        repository,
        denied: 403,
        read: (repo, adminUserId) => {
          const { invoiceId } = request.query;
          return repo.listAdminTransferProofs({
            ...pageArgs(request.query),
            adminUserId,
            ...(invoiceId === undefined ? {} : { invoiceId: invoiceId.toLowerCase() }),
          });
        },
      }),
  );
  routes.get(
    base + "/settings",
    { config: admin, schema: { response: { 200: adminBillingSettingsOutput, ...errors } } },
    (request, reply) =>
      readBilling({
        request,
        reply,
        repository,
        denied: 403,
        read: (repo, adminUserId) => repo.readAdminSettings(adminUserId),
      }),
  );
}

function registerMerchantBillingReads(api: FastifyInstance, repository?: BillingRepository) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  const base = "/v1/merchants/:merchantId";
  routes.get(
    base + "/billing",
    {
      config: owner,
      schema: {
        params: merchantParams,
        response: { 200: merchantBillingSubscriptionOutput, ...errors },
      },
    },
    (request, reply) =>
      readBilling({
        request,
        reply,
        repository,
        denied: 404,
        read: (repo, accountId) =>
          repo.readMerchantSubscription({
            accountId,
            merchantId: request.params.merchantId.toLowerCase(),
          }),
      }),
  );
  routes.get(
    base + "/invoices",
    {
      config: owner,
      schema: {
        params: merchantParams,
        querystring: merchantBillingInvoiceListQuery,
        response: { 200: billingInvoiceListOutput, ...errors },
      },
    },
    (request, reply) =>
      readBilling({
        request,
        reply,
        repository,
        denied: 404,
        read: (repo, accountId) =>
          repo.listMerchantInvoices({
            ...pageArgs(request.query),
            accountId,
            merchantId: request.params.merchantId.toLowerCase(),
          }),
      }),
  );
}

export function registerBillingReadRoutes(api: FastifyInstance, repository?: BillingRepository) {
  registerAdminBillingReads(api, repository);
  registerMerchantBillingReads(api, repository);
}
