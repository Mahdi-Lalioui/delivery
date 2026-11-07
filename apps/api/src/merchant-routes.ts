import { createHash } from "node:crypto";
import {
  adminMerchantReviewInput,
  adminMerchantReviewOutput,
  adminReviewQueueOutput,
  adminReviewQueueQuery,
  readAdminReviewCursor,
} from "@zaafran/contracts/admin";
import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  communeListOutput,
  communeListQuery,
  merchantApplicationInput,
  merchantApplicationOutput,
  merchantMembershipsOutput,
} from "@zaafran/contracts/merchant";
import type { createMerchantRepository } from "@zaafran/db/merchant";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MerchantServices {
  readonly repository: ReturnType<typeof createMerchantRepository>;
  readonly now: () => Date;
}

const publicConfig = { policy: { kind: "public" } } as const;
const merchantConfig = {
  policy: {
    kind: "roles",
    roles: ["customer", "merchant_owner", "merchant_manager", "merchant_staff"],
  },
} as const;
const adminConfig = { policy: { kind: "roles", roles: ["admin"] } } as const;

const merchantIdParams = z.strictObject({ merchantId: z.uuid() });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  422: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

const failureStatus = {
  account_unavailable: 403,
  invalid_commune: 422,
  outside_commune: 422,
  idempotency_conflict: 409,
  invalid_status: 409,
  not_found: 404,
  forbidden: 403,
};

function merchantProblem(reply: FastifyReply, kind: keyof typeof failureStatus): FastifyReply {
  return sendProblem(reply, failureStatus[kind], kind);
}

function commandIdentity(key: string, request: object) {
  return {
    idempotencyKeyHash: createHash("sha256").update(key).digest(),
    requestHash: createHash("sha256").update(JSON.stringify(request)).digest(),
  };
}

function registerApplication(api: FastifyInstance, services: MerchantServices | undefined): void {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/merchant-applications",
    {
      config: merchantConfig,
      schema: {
        headers: sessionBoundCommandHeaders,
        body: merchantApplicationInput,
        response: { 201: merchantApplicationOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      if (request.headers["x-expected-session-id"].toLowerCase() !== actor.sessionId)
        return sendProblem(reply, 409, "session_changed");
      const { photoIds, ...body } = request.body;
      if (photoIds?.length) return sendProblem(reply, 409, "photos_unavailable");
      const input = { ...body, communeId: body.communeId.toLowerCase() };
      const result = await services.repository.submitApplication({
        accountId: actor.accountId,
        input,
        now: services.now(),
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      if ("merchantId" in result) {
        return reply.code(201).send({ merchantId: result.merchantId, status: result.status });
      }
      return merchantProblem(reply, result.kind);
    },
  );
}

function registerMerchantReads(api: FastifyInstance, services: MerchantServices | undefined): void {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/communes",
    {
      config: publicConfig,
      schema: { querystring: communeListQuery, response: { 200: communeListOutput, ...errors } },
    },
    async (request, reply) => {
      if (!services) return sendProblem(reply, 503);
      return reply.send(await services.repository.listCommunes(request.query));
    },
  );

  routes.get(
    "/v1/me/merchants",
    { config: merchantConfig, schema: { response: { 200: merchantMembershipsOutput, ...errors } } },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const memberships = await services.repository.listMemberships({ accountId: actor.accountId });
      return reply.send({ memberships, sessionId: actor.sessionId });
    },
  );
}

function registerAdminQueue(api: FastifyInstance, services: MerchantServices | undefined): void {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/admin/merchant-applications",
    {
      config: adminConfig,
      schema: {
        querystring: adminReviewQueueQuery,
        response: { 200: adminReviewQueueOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const { limit, cursor } = request.query;
      const page = await services.repository.listPendingApplications({
        adminUserId: actor.accountId,
        limit,
        ...(cursor === undefined ? {} : { cursor: readAdminReviewCursor(cursor) }),
      });
      return page
        ? reply.send({ ...page, sessionId: actor.sessionId })
        : merchantProblem(reply, "forbidden");
    },
  );
}

function registerAdminReview(api: FastifyInstance, services: MerchantServices | undefined): void {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/admin/merchant-applications/:merchantId/review",
    {
      config: adminConfig,
      schema: {
        headers: sessionBoundCommandHeaders,
        params: merchantIdParams,
        body: adminMerchantReviewInput,
        response: { 200: adminMerchantReviewOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      if (request.headers["x-expected-session-id"].toLowerCase() !== actor.sessionId)
        return sendProblem(reply, 409, "session_changed");
      const body = { merchantId: request.params.merchantId.toLowerCase(), ...request.body };
      const result = await services.repository.reviewApplication({
        ...body,
        adminUserId: actor.accountId,
        now: services.now(),
        ...commandIdentity(request.headers["idempotency-key"], body),
      });
      if ("merchantId" in result) {
        return reply.send({
          merchantId: result.merchantId,
          status: result.status,
          reviewedAt: result.reviewedAt.toISOString(),
        });
      }
      return merchantProblem(reply, result.kind);
    },
  );
}

export function registerMerchantRoutes(
  api: FastifyInstance,
  services: MerchantServices | undefined,
): void {
  registerApplication(api, services);
  registerMerchantReads(api, services);
  registerAdminQueue(api, services);
  registerAdminReview(api, services);
}
