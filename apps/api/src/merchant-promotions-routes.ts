import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantPromotionInput,
  merchantPromotionListOutput,
  merchantPromotionOutput,
} from "@zaafran/contracts/promotions";
import type { createMerchantPromotionsRepository } from "@zaafran/db/promotions";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createMerchantPromotionsRepository>;
export interface MerchantPromotionsServices {
  readonly repository: Repository;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/promotions";
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
const merchantParams = z.strictObject({ merchantId: z.uuid() });
const promotionParams = merchantParams.extend({ promotionId: z.uuid() });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
const command = { headers: sessionBoundCommandHeaders, body: merchantPromotionInput };

function canonicalInput(input: z.infer<typeof merchantPromotionInput>) {
  const { activation } = input;
  return activation.kind === "code"
    ? { ...input, activation: { kind: "code" as const, code: activation.code.trim() } }
    : input;
}

function presentPromotion(
  reply: FastifyReply,
  result: Awaited<ReturnType<Repository["create"] | Repository["update"]>>,
  status: 200 | 201,
) {
  if ("promotion" in result) return reply.code(status).send(result.promotion);
  if (result.kind === "not_found") return sendProblem(reply, 404, result.kind);
  return sendProblem(
    reply,
    409,
    result.kind === "duplicate_code" ? "promotion_code_taken" : result.kind,
  );
}

export function registerMerchantPromotionsRoutes(
  api: FastifyInstance,
  services: MerchantPromotionsServices | undefined,
) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    path,
    {
      config,
      schema: { params: merchantParams, response: { 200: merchantPromotionListOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const page = await services.repository.list({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
      });
      return page
        ? reply.send({ ...page, sessionId: actor.sessionId })
        : sendProblem(reply, 404, "not_found");
    },
  );
  routes.post(
    path,
    {
      config,
      schema: {
        ...command,
        params: merchantParams,
        response: { 201: merchantPromotionOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!actor) return reply;
      reply.header("cache-control", "no-store");
      const { accountId, repository, now } = actor;
      const input = canonicalInput(request.body);
      const result = await repository.create({
        accountId,
        now,
        input,
        merchantId: request.params.merchantId.toLowerCase(),
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return presentPromotion(reply, result, 201);
    },
  );
  routes.put(
    path + "/:promotionId",
    {
      config,
      schema: {
        ...command,
        params: promotionParams,
        response: { 200: merchantPromotionOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!actor) return reply;
      reply.header("cache-control", "no-store");
      const { accountId, repository, now } = actor;
      const promotionId = request.params.promotionId.toLowerCase();
      const input = canonicalInput(request.body);
      const result = await repository.update({
        accountId,
        now,
        input,
        promotionId,
        merchantId: request.params.merchantId.toLowerCase(),
        ...commandIdentity(request.headers["idempotency-key"], { promotionId, input }),
      });
      return presentPromotion(reply, result, 200);
    },
  );
}
