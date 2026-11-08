import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantHoursCommandInput,
  merchantHoursOutput,
  merchantHoursPauseInput,
  merchantHoursPauseOutput,
  merchantHoursWriteOutput,
  merchantRamadanCommandInput,
  merchantRamadanOutput,
} from "@zaafran/contracts/merchant-hours";
import type { createMerchantHoursRepository } from "@zaafran/db/merchant-hours";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Repository = ReturnType<typeof createMerchantHoursRepository>;
export interface MerchantHoursServices {
  readonly repository: Repository;
  readonly now: () => Date;
}

const path = "/v1/merchants/:merchantId/hours";
// Hours follow the menu roles: owners and managers (D-011).
const config = {
  policy: { kind: "roles", roles: ["customer", "merchant_owner", "merchant_manager"] },
} as const;
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
const failureStatus = {
  not_found: 404,
  revision_conflict: 409,
  idempotency_conflict: 409,
  pause_not_in_future: 400,
};

function registerRead(api: FastifyInstance, services: MerchantHoursServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    path,
    {
      config,
      schema: { params: merchantParams, response: { 200: merchantHoursOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const hours = await services.repository.read({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
      });
      if (!hours) return sendProblem(reply, 404, "not_found");
      return reply.send({
        sessionId: actor.sessionId,
        revision: hours.revision,
        weekly: hours.weekly.map((day) => ({ weekday: day.weekday, ranges: [...day.ranges] })),
        specialDates: hours.specialDates.map((day) => ({
          date: day.date,
          ranges: [...day.ranges],
        })),
      });
    },
  );
}

function registerReplace(api: FastifyInstance, services: MerchantHoursServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().put(
    path,
    {
      config,
      schema: {
        params: merchantParams,
        headers: sessionBoundCommandHeaders,
        body: merchantHoursCommandInput,
        response: { 200: merchantHoursWriteOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, now, repository } = context;
      const input = request.body;
      const result = await repository.replace({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return result.kind === "applied" || result.kind === "replayed"
        ? reply.send({ revision: result.revision })
        : sendProblem(reply, failureStatus[result.kind], result.kind);
    },
  );
}

function registerRamadanRead(api: FastifyInstance, services: MerchantHoursServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    path + "/ramadan",
    {
      config,
      schema: { params: merchantParams, response: { 200: merchantRamadanOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const stored = await services.repository.readRamadan({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
      });
      if (!stored) return sendProblem(reply, 404, "not_found");
      // Stored schedules were parsed by merchantRamadanCommandInput; the response schema re-checks.
      const schedule = merchantRamadanOutput.shape.schedule.parse(stored.schedule);
      return reply.send({ sessionId: actor.sessionId, revision: stored.revision, schedule });
    },
  );
}

function registerRamadanReplace(api: FastifyInstance, services: MerchantHoursServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().put(
    path + "/ramadan",
    {
      config,
      schema: {
        params: merchantParams,
        headers: sessionBoundCommandHeaders,
        body: merchantRamadanCommandInput,
        response: { 200: merchantHoursWriteOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, now, repository } = context;
      const input = request.body;
      const result = await repository.replaceRamadan({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return result.kind === "applied" || result.kind === "replayed"
        ? reply.send({ revision: result.revision })
        : sendProblem(reply, failureStatus[result.kind], result.kind);
    },
  );
}

function registerPauseRead(api: FastifyInstance, services: MerchantHoursServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    path + "/pause",
    {
      config,
      schema: { params: merchantParams, response: { 200: merchantHoursPauseOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      reply.header("cache-control", "no-store");
      const stored = await services.repository.readPause({
        accountId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
      });
      if (!stored) return sendProblem(reply, 404, "not_found");
      return reply.send({ sessionId: actor.sessionId, ...stored });
    },
  );
}

function registerPauseSet(api: FastifyInstance, services: MerchantHoursServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().put(
    path + "/pause",
    {
      config,
      schema: {
        params: merchantParams,
        headers: sessionBoundCommandHeaders,
        body: merchantHoursPauseInput,
        response: { 200: merchantHoursWriteOutput, ...errors },
      },
    },
    async (request, reply) => {
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, now, repository } = context;
      const input = request.body;
      const result = await repository.pause({
        accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        input,
        now,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      return result.kind === "applied" || result.kind === "replayed"
        ? reply.send({ revision: result.revision })
        : sendProblem(reply, failureStatus[result.kind], result.kind);
    },
  );
}

export function registerMerchantHoursRoutes(
  api: FastifyInstance,
  services: MerchantHoursServices | undefined,
) {
  registerRead(api, services);
  registerReplace(api, services);
  registerRamadanRead(api, services);
  registerRamadanReplace(api, services);
  registerPauseRead(api, services);
  registerPauseSet(api, services);
}
