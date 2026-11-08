import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import {
  adminBillingSettingsInput,
  adminBillingSettingsOutput,
  adminIssueInvoiceInput,
  adminRecordPaymentInput,
  adminRecordPaymentOutput,
  adminVoidInvoiceInput,
  adminVoidInvoiceOutput,
  billingInvoice,
} from "@zaafran/contracts/billing";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { createBillingWriteRepository } from "@zaafran/db/billing";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createBillingWriteRepository>;
export interface BillingWriteServices {
  readonly repository: Repository;
  readonly now: () => Date;
}

const base = "/v1/admin/billing";
const config = { policy: { kind: "roles", roles: ["admin"] } } as const;
const merchantParams = z.strictObject({ merchantId: z.uuid() });
const invoiceParams = z.strictObject({ invoiceId: z.uuid() });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function resolveBillingCommand<Input extends object, Target extends object>(
  request: FastifyRequest & {
    headers: z.infer<typeof sessionBoundCommandHeaders>;
    body: Input;
  },
  reply: FastifyReply,
  { services, target }: { services: BillingWriteServices | undefined; target: Target },
) {
  reply.header("cache-control", "no-store");
  const actor = resolveSessionCommand({
    request,
    reply,
    services,
    expectedSessionId: request.headers["x-expected-session-id"],
  });
  if (!actor) return undefined;
  const { repository, now, accountId, sessionId } = actor;
  return {
    repository,
    sessionId,
    command: {
      ...target,
      now,
      adminUserId: accountId,
      input: request.body,
      ...commandIdentity(request.headers["idempotency-key"], { target, input: request.body }),
    },
  };
}

function presentCommand(
  reply: FastifyReply,
  result: { kind: "applied" | "replayed"; value: object } | { kind: string },
  { status, sessionId }: { status: 200 | 201; sessionId?: string },
) {
  if ("value" in result) {
    return reply.code(status).send(sessionId ? { ...result.value, sessionId } : result.value);
  }
  if (result.kind === "forbidden") return sendProblem(reply, 403);
  if (result.kind === "not_found") return sendProblem(reply, 404, result.kind);
  return sendProblem(reply, 409, result.kind);
}

export function registerBillingWriteRoutes(
  api: FastifyInstance,
  services: BillingWriteServices | undefined,
) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  const headers = sessionBoundCommandHeaders;
  routes.post(
    base + "/merchants/:merchantId/invoices",
    {
      config,
      schema: {
        headers,
        params: merchantParams,
        body: adminIssueInvoiceInput,
        response: { 201: billingInvoice, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveBillingCommand(request, reply, {
        services,
        target: { merchantId: request.params.merchantId.toLowerCase() },
      });
      if (!context) return reply;
      return presentCommand(reply, await context.repository.issue(context.command), {
        status: 201,
      });
    },
  );
  routes.post(
    base + "/invoices/:invoiceId/void",
    {
      config,
      schema: {
        headers,
        params: invoiceParams,
        body: adminVoidInvoiceInput,
        response: { 200: adminVoidInvoiceOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveBillingCommand(request, reply, {
        services,
        target: { invoiceId: request.params.invoiceId.toLowerCase() },
      });
      if (!context) return reply;
      return presentCommand(reply, await context.repository.voidInvoice(context.command), {
        status: 200,
      });
    },
  );
  routes.post(
    base + "/invoices/:invoiceId/payments",
    {
      config,
      schema: {
        headers,
        params: invoiceParams,
        body: adminRecordPaymentInput,
        response: { 200: adminRecordPaymentOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveBillingCommand(request, reply, {
        services,
        target: { invoiceId: request.params.invoiceId.toLowerCase() },
      });
      if (!context) return reply;
      return presentCommand(reply, await context.repository.recordPayment(context.command), {
        status: 200,
      });
    },
  );
  routes.put(
    base + "/settings",
    {
      config,
      schema: {
        headers,
        body: adminBillingSettingsInput,
        response: { 200: adminBillingSettingsOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveBillingCommand(request, reply, { services, target: {} });
      if (!context) return reply;
      return presentCommand(reply, await context.repository.updateSettings(context.command), {
        status: 200,
        sessionId: context.sessionId,
      });
    },
  );
}
