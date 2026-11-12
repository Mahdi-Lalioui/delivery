import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  customerFavouritesOutput,
  customerFavouriteWriteOutput,
} from "@zaafran/contracts/retention";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyContextConfig, FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Services = {
  repository: Pick<ReturnType<typeof createOrderRepository>, "favourites" | "setFavourite">;
  now: () => Date;
};
const config = { policy: { kind: "roles", roles: ["customer"] } } satisfies FastifyContextConfig;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

export function registerFavouriteRoutes(api: FastifyInstance, services?: Services) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/me/favourites",
    { config, schema: { response: { 200: customerFavouritesOutput, ...errors } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const page = await services.repository.favourites({
        customerId: actor.accountId,
        sessionId: actor.sessionId,
        now: services.now(),
      });
      return page ? reply.send(page) : sendProblem(reply, 401);
    },
  );
  for (const method of ["PUT", "DELETE"] as const) {
    routes.route({
      method,
      url: "/v1/me/favourites/:merchantId",
      config,
      schema: {
        params: z.strictObject({ merchantId: z.uuid() }),
        response: { 200: customerFavouriteWriteOutput, ...errors },
      },
      async handler(request, reply) {
        reply.header("cache-control", "no-store");
        const actor = getRequestActor(request);
        if (!actor) return sendProblem(reply, 401);
        if (!services) return sendProblem(reply, 503);
        const { merchantId } = request.params;
        const isFavourite = method === "PUT";
        const result = await services.repository.setFavourite({
          customerId: actor.accountId,
          sessionId: actor.sessionId,
          merchantId,
          isFavourite,
          now: services.now(),
        });
        switch (result) {
          case "saved":
            return reply.send({ merchantId, isFavourite });
          case "not_found":
            return sendProblem(reply, 404);
          case "favourite_limit":
            return sendProblem(reply, 409, result);
          case "unauthenticated":
            return sendProblem(reply, 401);
        }
      },
    });
  }
}
