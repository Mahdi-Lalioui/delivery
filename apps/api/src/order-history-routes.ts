import { problemResponseSchema } from "@zaafran/contracts/health";
import { orderParams } from "@zaafran/contracts/orders";
import {
  customerOrderHistoryOutput,
  customerOrderHistoryQuery,
  customerOrderReceiptOutput,
} from "@zaafran/contracts/retention";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyContextConfig, FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type HistoryRepository = Pick<ReturnType<typeof createOrderRepository>, "history" | "receipt">;
const config = { policy: { kind: "roles", roles: ["customer"] } } satisfies FastifyContextConfig;
const failures = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

export function registerOrderHistoryRoutes(api: FastifyInstance, repository?: HistoryRepository) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/me/orders",
    {
      config,
      schema: {
        querystring: customerOrderHistoryQuery,
        response: { 200: customerOrderHistoryOutput, ...failures },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!repository) return sendProblem(reply, 503);
      const page = await repository.history({
        customerId: actor.accountId,
        sessionId: actor.sessionId,
        query: request.query,
      });
      return page ? reply.send(page) : sendProblem(reply, 401);
    },
  );
  routes.get(
    "/v1/me/orders/:orderId/receipt",
    {
      config,
      schema: {
        params: orderParams,
        response: { 200: customerOrderReceiptOutput, ...failures },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!repository) return sendProblem(reply, 503);
      const receipt = await repository.receipt({
        customerId: actor.accountId,
        sessionId: actor.sessionId,
        orderId: request.params.orderId,
      });
      return receipt ? reply.send(receipt) : sendProblem(reply, 404);
    },
  );
}
