import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantReviewPageOutput,
  merchantReviewPageQuery,
  publicReviewPageOutput,
  publicReviewPageQuery,
} from "@zaafran/contracts/ratings";
import { publicRestaurantParams } from "@zaafran/contracts/restaurant";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Reviews = Pick<ReturnType<typeof createOrderRepository>, "publicReviews" | "merchantReviews">;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

export function registerReviewsRoutes(api: FastifyInstance, repository?: Reviews) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/restaurants/:slug/reviews",
    {
      config: { policy: { kind: "public" } },
      schema: {
        params: publicRestaurantParams,
        querystring: publicReviewPageQuery,
        response: { 200: publicReviewPageOutput, ...errors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      if (!repository) return sendProblem(reply, 503);
      const page = await repository.publicReviews({ ...request.params, ...request.query });
      return page ? reply.send(page) : sendProblem(reply, 404);
    },
  );
  routes.get(
    "/v1/merchants/:merchantId/reviews",
    {
      config: {
        policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
      },
      schema: {
        params: z.strictObject({ merchantId: z.uuid() }),
        querystring: merchantReviewPageQuery,
        response: { 200: merchantReviewPageOutput, ...errors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!repository) return sendProblem(reply, 503);
      const page = await repository.merchantReviews({
        ...request.params,
        ...request.query,
        accountId: actor.accountId,
        sessionId: actor.sessionId,
      });
      return page ? reply.send(page) : sendProblem(reply, 404);
    },
  );
}
