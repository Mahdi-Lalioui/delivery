import { idempotencyKeySchema } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { orderPlacementWithContactInput, orderSummary } from "@zaafran/contracts/orders";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type OrderServices = {
  repository: Pick<ReturnType<typeof createOrderRepository>, "place">;
  now: () => Date;
};

const conflicts = new Set([
  "quote_expired",
  "quote_changed",
  "quote_consumed",
  "idempotency_conflict",
]);

export function registerOrderRoutes(api: FastifyInstance, services?: OrderServices) {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/orders",
    {
      config: { policy: { kind: "roles", roles: ["customer"] } },
      onSend(_request, reply, payload) {
        reply.header("cache-control", "no-store");
        return Promise.resolve(payload);
      },
      schema: {
        headers: z.object({ "idempotency-key": idempotencyKeySchema }),
        body: orderPlacementWithContactInput,
        response: {
          201: orderSummary,
          400: problemResponseSchema,
          401: problemResponseSchema,
          403: problemResponseSchema,
          409: problemResponseSchema,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.place({
        customerId: actor.accountId,
        input: request.body,
        now: services.now(),
        idempotencyKey: request.headers["idempotency-key"],
      });
      if (result.kind === "placed") return reply.code(201).send(result.order);
      if (result.kind === "unauthorized") return sendProblem(reply, 401);
      return sendProblem(reply, conflicts.has(result.kind) ? 409 : 400, result.kind);
    },
  );
}
