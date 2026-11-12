import { idempotencyKeySchema } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { orderParams } from "@zaafran/contracts/orders";
import { orderRatingInput, orderRatingOutput } from "@zaafran/contracts/ratings";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyContextConfig, FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Services = {
  repository: Pick<ReturnType<typeof createOrderRepository>, "rating" | "rate">;
  now: () => Date;
};

const config = { policy: { kind: "roles", roles: ["customer"] } } satisfies FastifyContextConfig;
const schema = {
  params: orderParams,
  response: {
    200: orderRatingOutput,
    400: problemResponseSchema,
    401: problemResponseSchema,
    403: problemResponseSchema,
    404: problemResponseSchema,
    409: problemResponseSchema,
    429: problemResponseSchema,
    503: problemResponseSchema,
  },
};

export function registerOrderRatingRoutes(api: FastifyInstance, services?: Services) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/orders/:orderId/rating",
    { config, schema: { ...schema, response: { ...schema.response, 204: z.undefined() } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.rating({
        ...request.params,
        customerId: actor.accountId,
        sessionId: actor.sessionId,
      });
      if (result.kind === "unrated") return reply.code(204).send();
      return result.kind === "rated" ? reply.send(result.rating) : sendProblem(reply, 404);
    },
  );
  routes.put(
    "/v1/orders/:orderId/rating",
    {
      config,
      schema: {
        ...schema,
        body: orderRatingInput,
        headers: z.object({ "idempotency-key": idempotencyKeySchema }),
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.rate({
        ...request.params,
        customerId: actor.accountId,
        sessionId: actor.sessionId,
        idempotencyKey: request.headers["idempotency-key"],
        input: request.body,
        now: services.now(),
      });
      switch (result.kind) {
        case "rated":
          return reply.send(result.rating);
        case "not_found":
          return sendProblem(reply, 404);
        case "invalid_stars":
          return sendProblem(reply, 400, result.kind);
        default:
          return sendProblem(reply, 409, result.kind);
      }
    },
  );
}
