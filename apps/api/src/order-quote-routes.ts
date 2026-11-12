import { problemResponseSchema } from "@zaafran/contracts/health";
import { orderQuoteInput, orderQuoteOutput } from "@zaafran/contracts/orders";
import type { createOrderQuoteRepository } from "@zaafran/db/order-quotes";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type QuoteServices = {
  readonly repository: Pick<ReturnType<typeof createOrderQuoteRepository>, "create">;
  readonly now: () => Date;
};

export function registerOrderQuoteRoutes(api: FastifyInstance, services?: QuoteServices) {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/quotes",
    {
      config: { policy: { kind: "roles", roles: ["customer"] } },
      onSend(_request, reply, payload) {
        reply.header("cache-control", "no-store");
        return Promise.resolve(payload);
      },
      schema: {
        body: orderQuoteInput,
        response: {
          201: orderQuoteOutput,
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
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.create({
        customerId: actor.accountId,
        input: request.body,
        now: services.now(),
      });
      switch (result.kind) {
        case "quoted":
          return reply.code(201).send(result.quote);
        case "unauthorized":
          return sendProblem(reply, 401);
        case "address_not_found":
          return sendProblem(reply, 404);
        default:
          return sendProblem(reply, 400, result.kind);
      }
    },
  );
}
