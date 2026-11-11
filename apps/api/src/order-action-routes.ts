import { idempotencyKeySchema } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { orderActionInputs, orderParams, orderSummary } from "@zaafran/contracts/orders";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor, type Actor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = Pick<ReturnType<typeof createOrderRepository>, "read" | "apply">;
type OrderServices = { repository: Repository; now: () => Date };
type Action = Parameters<Repository["apply"]>[0]["action"];
type Role = Actor["role"];
type ActionRoute<Body extends z.ZodType<{ expectedVersion: number }>> = {
  name: string;
  roles: readonly Role[];
  body: Body;
  action: (input: z.output<Body>) => Action | undefined;
};

const routePath = "/v1/orders/:orderId";
const merchant = ["customer", "merchant_owner", "merchant_manager", "merchant_staff"] as const;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function readActor(request: FastifyRequest) {
  const actor = getRequestActor(request);
  return actor
    ? {
        accountId: actor.accountId,
        role: actor.role === "customer" ? ("standard" as const) : actor.role,
      }
    : undefined;
}

function registerAction<Body extends z.ZodType<{ expectedVersion: number }>>(
  api: FastifyInstance,
  services: OrderServices | undefined,
  descriptor: ActionRoute<Body>,
) {
  api.withTypeProvider<ZodTypeProvider>().post(
    routePath + "/" + descriptor.name,
    {
      config: { policy: { kind: "roles", roles: descriptor.roles } },
      schema: {
        params: orderParams,
        headers: z.object({ "idempotency-key": idempotencyKeySchema }),
        body: descriptor.body,
        response: { 200: orderSummary, ...errors },
      },
    },
    async (request, reply) => {
      const actor = readActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const input = descriptor.body.parse(request.body);
      const action = descriptor.action(input);
      if (!action) return sendProblem(reply, 503, "delivery_photo_unavailable");
      const result = await services.repository.apply({
        ...actor,
        orderId: request.params.orderId,
        expectedVersion: input.expectedVersion,
        action,
        now: services.now(),
        idempotencyKey: request.headers["idempotency-key"],
      });
      if (result.kind === "applied") return reply.send(result.order);
      if (result.kind === "not_found" || result.kind === "order_forbidden")
        return sendProblem(reply, 404);
      if (result.kind === "delivery_code_unavailable") return sendProblem(reply, 503, result.kind);
      return sendProblem(reply, result.kind === "invalid_order_command" ? 400 : 409, result.kind);
    },
  );
}

export function registerOrderActionRoutes(api: FastifyInstance, services?: OrderServices) {
  void api.register((scope, _options, done) => {
    scope.addHook("onSend", (_request, reply, payload) => {
      reply.header("cache-control", "no-store");
      return Promise.resolve(payload);
    });
    scope.withTypeProvider<ZodTypeProvider>().get(
      routePath,
      {
        config: { policy: { kind: "roles", roles: [...merchant, "admin"] } },
        schema: { params: orderParams, response: { 200: orderSummary, ...errors } },
      },
      async (request, reply) => {
        const actor = readActor(request);
        if (!actor) return sendProblem(reply, 401);
        if (!services) return sendProblem(reply, 503);
        const order = await services.repository.read({ ...actor, orderId: request.params.orderId });
        return order ? reply.send(order) : sendProblem(reply, 404);
      },
    );
    registerAction(scope, services, {
      name: "accept",
      roles: merchant,
      body: orderActionInputs.accept,
      action: ({ prepMinutes }) => ({ kind: "accept", prepMinutes }),
    });
    registerAction(scope, services, {
      name: "reject",
      roles: merchant,
      body: orderActionInputs.reject,
      action: ({ reason, soldOutItemIds }) => ({
        kind: "reject",
        reason,
        soldOutItemIds: (soldOutItemIds ?? []).map((id) => id.toLowerCase()).sort(),
      }),
    });
    registerAction(scope, services, {
      name: "cancel",
      roles: merchant,
      body: orderActionInputs.cancel,
      action: ({ reason }) => ({ kind: "cancel", reason }),
    });
    registerAction(scope, services, {
      name: "ready",
      roles: merchant,
      body: orderActionInputs.ready,
      action: () => ({ kind: "markReady" }),
    });
    registerAction(scope, services, {
      name: "collect",
      roles: merchant,
      body: orderActionInputs.collect,
      action: () => ({ kind: "collect" }),
    });
    registerAction(scope, services, {
      name: "assign",
      roles: merchant,
      body: orderActionInputs.assign,
      action: ({ courierId }) => ({ kind: "assignCourier", courierId: courierId.toLowerCase() }),
    });
    registerAction(scope, services, {
      name: "pick-up",
      roles: [...merchant, "courier"],
      body: orderActionInputs["pick-up"],
      action: () => ({ kind: "pickUp" }),
    });
    registerAction(scope, services, {
      name: "deliver",
      roles: ["customer", "courier"],
      body: orderActionInputs.deliver,
      action: ({ proof }) =>
        proof.kind === "code" ? { kind: "deliver", code: proof.code } : undefined,
    });
    registerAction(scope, services, {
      name: "force",
      roles: ["admin"],
      body: orderActionInputs.force,
      action: ({ to, reason }) => ({ kind: "force", to, reason }),
    });
    done();
  });
}
