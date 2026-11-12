import { problemResponseSchema } from "@zaafran/contracts/health";
import { orderParams } from "@zaafran/contracts/orders";
import { customerTrackingOutput } from "@zaafran/contracts/tracking";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Tracking = ReturnType<typeof createOrderRepository>["tracking"];

export function registerTrackingRoutes(api: FastifyInstance, tracking?: Tracking) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/orders/:orderId/tracking",
    {
      config: { policy: { kind: "roles", roles: ["customer"] } },
      onSend(_request, reply, payload) {
        reply.header("cache-control", "no-store");
        return Promise.resolve(payload);
      },
      schema: {
        params: orderParams,
        response: {
          200: customerTrackingOutput,
          400: problemResponseSchema,
          401: problemResponseSchema,
          403: problemResponseSchema,
          404: problemResponseSchema,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!tracking) return sendProblem(reply, 503);
      const view = await tracking({
        ...request.params,
        customerId: actor.accountId,
        sessionId: actor.sessionId,
      });
      return view ? reply.send(view) : sendProblem(reply, 404);
    },
  );
}
