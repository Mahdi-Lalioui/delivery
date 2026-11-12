import { idempotencyKeySchema } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantReviewReplyInput,
  merchantReviewReplyOutput,
  merchantReviewReportInput,
  merchantReviewReportOutput,
} from "@zaafran/contracts/ratings";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyContextConfig, FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Services = {
  repository: Pick<ReturnType<typeof createOrderRepository>, "replyToReview" | "reportReview">;
  now: () => Date;
};
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} satisfies FastifyContextConfig;
const params = z.strictObject({ merchantId: z.uuid(), ratingId: z.uuid() });
const headers = z.object({ "idempotency-key": idempotencyKeySchema });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
const path = "/v1/merchants/:merchantId/reviews/:ratingId";

export function registerReviewCommands(api: FastifyInstance, services?: Services) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.put(
    path + "/reply",
    {
      config,
      schema: {
        params,
        headers,
        body: merchantReviewReplyInput,
        response: { 200: merchantReviewReplyOutput, ...errors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.replyToReview({
        ...request.params,
        ...request.body,
        accountId: actor.accountId,
        sessionId: actor.sessionId,
        idempotencyKey: request.headers["idempotency-key"],
        now: services.now(),
      });
      if (result.kind === "saved") return reply.send(result.output);
      return result.kind === "not_found"
        ? sendProblem(reply, 404)
        : sendProblem(reply, 409, result.kind);
    },
  );
  routes.post(
    path + "/report",
    {
      config,
      schema: {
        params,
        headers,
        body: merchantReviewReportInput,
        response: { 200: merchantReviewReportOutput, ...errors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.reportReview({
        ...request.params,
        ...request.body,
        accountId: actor.accountId,
        sessionId: actor.sessionId,
        idempotencyKey: request.headers["idempotency-key"],
        now: services.now(),
      });
      if (result.kind === "saved") return reply.send(result.output);
      return result.kind === "not_found"
        ? sendProblem(reply, 404)
        : sendProblem(reply, 409, result.kind);
    },
  );
}
