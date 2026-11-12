import {
  adminOrderDetailOutput,
  adminOrderSearchInput,
  adminOrderSearchOutput,
} from "@zaafran/contracts/admin-orders";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { orderParams } from "@zaafran/contracts/orders";
import type { createAdminOrdersRepository } from "@zaafran/db/admin-orders";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createAdminOrdersRepository>;
const config = { policy: { kind: "roles", roles: ["admin"] } } as const;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

export function registerAdminOrdersRoutes(api: FastifyInstance, repository?: Repository) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.post(
    "/v1/admin/orders/search",
    {
      config,
      schema: { body: adminOrderSearchInput, response: { 200: adminOrderSearchOutput, ...errors } },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!repository) return sendProblem(reply, 503);
      const page = await repository.search({ accountId: actor.accountId, input: request.body });
      return page ? reply.send({ ...page, sessionId: actor.sessionId }) : sendProblem(reply, 404);
    },
  );
  routes.get(
    "/v1/admin/orders/:orderId/timeline",
    {
      config,
      schema: { params: orderParams, response: { 200: adminOrderDetailOutput, ...errors } },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!repository) return sendProblem(reply, 503);
      const detail = await repository.detail({
        accountId: actor.accountId,
        orderId: request.params.orderId.toLowerCase(),
      });
      return detail
        ? reply.send({ ...detail, sessionId: actor.sessionId })
        : sendProblem(reply, 404);
    },
  );
}
