import {
  addressInput,
  addressListOutput,
  addressOutput,
  addressParams,
} from "@zaafran/contracts/addresses";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { createAddressRepository } from "@zaafran/db/addresses";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Addresses = ReturnType<typeof createAddressRepository>;
type SaveResult = Awaited<ReturnType<Addresses["create"]>>;

const collection = "/v1/me/addresses";
const item = "/v1/me/addresses/:addressId";
const config = { policy: { kind: "roles", roles: ["customer"] } } as const;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function sendAddress(reply: FastifyReply, result: SaveResult, status: 200 | 201) {
  switch (result.kind) {
    case "saved":
      return reply.code(status).send(result.address);
    case "missing":
      return sendProblem(reply, 404);
    case "outside_service_area":
    case "voice_note_unavailable":
      return sendProblem(reply, 400, result.kind);
  }
}

export function registerAddressRoutes(api: FastifyInstance, addresses?: Addresses) {
  void api.register((scope, _options, done) => {
    scope.addHook("onSend", (_request, reply, payload) => {
      reply.header("cache-control", "no-store");
      return Promise.resolve(payload);
    });
    const routes = scope.withTypeProvider<ZodTypeProvider>();
    routes.get(
      collection,
      { config, schema: { response: { 200: addressListOutput, ...errors } } },
      async (request, reply) => {
        const actor = getRequestActor(request);
        if (!actor) return sendProblem(reply, 401);
        if (!addresses) return sendProblem(reply, 503);
        return reply.send({ addresses: await addresses.list(actor.accountId) });
      },
    );
    routes.post(
      collection,
      { config, schema: { body: addressInput, response: { 201: addressOutput, ...errors } } },
      async (request, reply) => {
        const actor = getRequestActor(request);
        if (!actor) return sendProblem(reply, 401);
        if (!addresses) return sendProblem(reply, 503);
        return sendAddress(reply, await addresses.create(actor.accountId, request.body), 201);
      },
    );
    routes.put(
      item,
      {
        config,
        schema: {
          params: addressParams,
          body: addressInput,
          response: { 200: addressOutput, ...errors },
        },
      },
      async (request, reply) => {
        const actor = getRequestActor(request);
        if (!actor) return sendProblem(reply, 401);
        if (!addresses) return sendProblem(reply, 503);
        const result = await addresses.update(
          actor.accountId,
          request.params.addressId,
          request.body,
        );
        return sendAddress(reply, result, 200);
      },
    );
    routes.delete(
      item,
      { config, schema: { params: addressParams, response: { 204: z.void(), ...errors } } },
      async (request, reply) => {
        const actor = getRequestActor(request);
        if (!actor) return sendProblem(reply, 401);
        if (!addresses) return sendProblem(reply, 503);
        const removed = await addresses.remove(actor.accountId, request.params.addressId);
        return removed ? reply.code(204).send() : sendProblem(reply, 404);
      },
    );
    done();
  });
}
