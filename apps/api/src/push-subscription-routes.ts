import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  pushPublicKeyOutput,
  pushSubscriptionInput,
  removePushSubscriptionInput,
} from "@zaafran/contracts/push";
import type { createPushSubscriptionRepository } from "@zaafran/db/push-subscriptions";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createPushSubscriptionRepository>;
const path = "/v1/me/push-subscriptions";
const config = { policy: { kind: "roles", roles: ["customer"] } } as const;
const response = {
  204: z.void(),
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function identity(request: FastifyRequest) {
  const actor = getRequestActor(request);
  return actor && { userId: actor.accountId, sessionId: actor.sessionId };
}

export function registerPushSubscriptionRoutes(
  api: FastifyInstance,
  repository?: Repository,
  publicKey?: string,
) {
  void api.register((scope, _options, done) => {
    scope.addHook("onSend", (_request, reply, body) => {
      reply.header("cache-control", "no-store");
      return Promise.resolve(body);
    });
    const routes = scope.withTypeProvider<ZodTypeProvider>();
    routes.get(
      "/v1/push/public-key",
      {
        config: { policy: { kind: "public" } },
        schema: {
          response: {
            200: pushPublicKeyOutput,
            429: problemResponseSchema,
            503: problemResponseSchema,
          },
        },
      },
      (_request, reply) => {
        if (publicKey === undefined) {
          sendProblem(reply, 503);
          return;
        }
        reply.send({ publicKey });
      },
    );
    routes.post(
      path,
      { config, schema: { body: pushSubscriptionInput, response } },
      async (request, reply) => {
        const actor = identity(request);
        if (!actor) return sendProblem(reply, 401);
        if (!repository) return sendProblem(reply, 503);
        const result = await repository.save(actor, request.body);
        switch (result) {
          case "saved":
            return reply.code(204).send();
          case "unauthorized":
            return sendProblem(reply, 401);
          case "subscription_limit":
            return sendProblem(reply, 429, result);
          case "subscription_in_use":
            return sendProblem(reply, 409, result);
        }
      },
    );
    routes.delete(
      path,
      { config, schema: { body: removePushSubscriptionInput, response } },
      async (request, reply) => {
        const actor = identity(request);
        if (!actor) return sendProblem(reply, 401);
        if (!repository) return sendProblem(reply, 503);
        const result = await repository.remove(actor, request.body.endpoint);
        return result === "removed" ? reply.code(204).send() : sendProblem(reply, 401);
      },
    );
    done();
  });
}
