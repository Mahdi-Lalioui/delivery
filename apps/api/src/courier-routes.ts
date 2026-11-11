import {
  courierInviteAcceptInput,
  courierInviteAcceptOutput,
  courierInviteInput,
  courierInviteOutput,
  courierJobsOutput,
  courierPositionsInput,
  courierPositionsOutput,
  courierPresenceInput,
  courierRosterOutput,
} from "@zaafran/contracts/courier";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { createCourierRepository } from "@zaafran/db/couriers";
import type { onSendAsyncHookHandler, FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor, type Actor } from "./policy.js";
import { sendProblem } from "./problems.js";

type CourierServices = { repository: ReturnType<typeof createCourierRepository>; now: () => Date };
const merchantParams = z.strictObject({ merchantId: z.uuid() });
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function policy(roles: Actor["role"][]) {
  return { policy: { kind: "roles", roles } } as const;
}

const noStore: onSendAsyncHookHandler = (_request, reply, payload) => {
  reply.header("cache-control", "no-store");
  return Promise.resolve(payload);
};

export function registerCourierRoutes(api: FastifyInstance, services?: CourierServices) {
  const routes = api.withTypeProvider<ZodTypeProvider>();

  routes.post(
    "/v1/merchants/:merchantId/couriers/invites",
    {
      onSend: noStore,
      config: policy(["customer", "merchant_owner"]),
      schema: {
        params: merchantParams,
        body: courierInviteInput,
        response: { 201: courierInviteOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.invite({
        ...request.params,
        ...request.body,
        userId: actor.accountId,
        sessionId: actor.sessionId,
        now: services.now(),
      });
      if (result.kind === "not_found") return sendProblem(reply, 404);
      if (result.kind === "courier_already_registered") return sendProblem(reply, 409, result.kind);
      return reply.code(201).send(result.invite);
    },
  );

  routes.get(
    "/v1/merchants/:merchantId/couriers",
    {
      onSend: noStore,
      config: policy(["customer", "merchant_owner", "merchant_manager", "merchant_staff"]),
      schema: { params: merchantParams, response: { 200: courierRosterOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const couriers = await services.repository.list({
        ...request.params,
        userId: actor.accountId,
        sessionId: actor.sessionId,
      });
      return couriers ? reply.send({ couriers }) : sendProblem(reply, 404);
    },
  );

  routes.post(
    "/v1/courier/invites/accept",
    {
      onSend: noStore,
      config: policy(["customer", "courier"]),
      schema: {
        body: courierInviteAcceptInput,
        response: { 200: courierInviteAcceptOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.accept({
        ...request.body,
        userId: actor.accountId,
        sessionId: actor.sessionId,
        now: services.now(),
      });
      if (result.kind === "accepted") return reply.send(result.courier);
      if (result.kind === "not_found") return sendProblem(reply, 404);
      if (result.kind === "unauthorized") return sendProblem(reply, 401);
      return sendProblem(reply, 409, result.kind);
    },
  );

  routes.get(
    "/v1/courier/jobs",
    {
      onSend: noStore,
      config: policy(["customer", "courier"]),
      schema: { response: { 200: courierJobsOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const jobs = await services.repository.jobs({
        userId: actor.accountId,
        sessionId: actor.sessionId,
      });
      return jobs ? reply.send(jobs) : sendProblem(reply, 403);
    },
  );

  routes.post(
    "/v1/courier/positions",
    {
      onSend: noStore,
      config: policy(["customer", "courier"]),
      schema: { body: courierPositionsInput, response: { 200: courierPositionsOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.repository.recordPositions({
        ...request.body,
        userId: actor.accountId,
        sessionId: actor.sessionId,
        now: services.now(),
      });
      if (result.kind === "not_found") return sendProblem(reply, 404);
      if (result.kind === "rate_limited") {
        reply.header("retry-after", "3");
        return sendProblem(reply, 429);
      }
      return reply.send({ accepted: result.accepted });
    },
  );

  routes.post(
    "/v1/courier/presence",
    {
      onSend: noStore,
      config: policy(["customer", "courier"]),
      schema: { body: courierPresenceInput, response: { 204: z.void(), ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const changed = await services.repository.setPresence({
        ...request.body,
        userId: actor.accountId,
        sessionId: actor.sessionId,
      });
      return changed ? reply.code(204).send() : sendProblem(reply, 403);
    },
  );
}
