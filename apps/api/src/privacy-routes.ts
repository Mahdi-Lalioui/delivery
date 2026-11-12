import { idempotencyKeySchema } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  customerPrivacyChallengeOutput,
  customerPrivacyDeleteInput,
  customerPrivacyDeleteOutput,
  customerPrivacyExportOutput,
} from "@zaafran/contracts/retention";
import type { PublicLocale } from "@zaafran/i18n/locales";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { clearSessionCookie } from "./auth-transport.js";
import { messageLocale } from "./message-copy.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

type Identity = { userId: string; sessionId: string };
type Confirmation = z.infer<typeof customerPrivacyDeleteInput>;
type Issue =
  | { kind: "issued"; challengeId: string; expiresAt: Date }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "unauthorized" | "delivery_unavailable" };
type ConfirmationResult = "deleted" | "invalid_code" | "challenge_expired" | "unauthorized";

export interface PrivacyServices {
  issue(
    input: Identity & { requestIp: string; idempotencyKey: string; locale?: PublicLocale },
  ): Promise<Issue>;
  confirm(input: Identity & Confirmation): Promise<ConfirmationResult>;
  replay(request: FastifyRequest, input: Confirmation): Promise<boolean>;
  exportAccount(input: Identity): Promise<z.infer<typeof customerPrivacyExportOutput> | undefined>;
}

const config = { policy: { kind: "roles", roles: ["customer"] } } as const;
const errors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
const challengeHeaders = z.object({ "idempotency-key": idempotencyKeySchema });

function identity(request: FastifyRequest): Identity | undefined {
  const actor = getRequestActor(request);
  return actor && { userId: actor.accountId, sessionId: actor.sessionId };
}

function privateResponse(_request: FastifyRequest, reply: FastifyReply, payload: unknown) {
  reply.header("cache-control", "no-store");
  return Promise.resolve(payload);
}

function finishDeletion(reply: FastifyReply, result: ConfirmationResult) {
  switch (result) {
    case "deleted":
      return reply.header("set-cookie", clearSessionCookie).code(204).send();
    case "invalid_code":
      return sendProblem(reply, 400, result);
    case "challenge_expired":
      return sendProblem(reply, 409, result);
    case "unauthorized":
      return sendProblem(reply, 401);
  }
}

export function registerPrivacyRoutes(api: FastifyInstance, services?: PrivacyServices) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/me/export",
    {
      config,
      onSend: privateResponse,
      schema: { response: { 200: customerPrivacyExportOutput, ...errors } },
    },
    async (request, reply) => {
      const actor = identity(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.exportAccount(actor);
      return result ? reply.send(result) : sendProblem(reply, 401);
    },
  );
  routes.post(
    "/v1/me/deletion-challenge",
    {
      config,
      onSend: privateResponse,
      schema: {
        headers: challengeHeaders,
        response: { 201: customerPrivacyChallengeOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = identity(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const result = await services.issue({
        ...actor,
        requestIp: request.ip,
        ...(request.headers["accept-language"]
          ? { locale: messageLocale(request.headers["accept-language"]) }
          : {}),
        idempotencyKey: request.headers["idempotency-key"],
      });
      switch (result.kind) {
        case "issued":
          return reply
            .code(201)
            .send({ challengeId: result.challengeId, expiresAt: result.expiresAt.toISOString() });
        case "rate_limited":
          reply.header("retry-after", String(result.retryAfterSeconds));
          return sendProblem(reply, 429);
        case "delivery_unavailable":
          return sendProblem(reply, 503);
        case "unauthorized":
          return sendProblem(reply, 401);
      }
    },
  );
  routes.delete(
    "/v1/me",
    {
      config: { policy: { ...config.policy, allowDeletionReplay: true } },
      onSend: privateResponse,
      schema: {
        body: customerPrivacyDeleteInput,
        response: { 204: customerPrivacyDeleteOutput, ...errors },
      },
    },
    async (request, reply) => {
      const actor = identity(request);
      if (actor) {
        if (!services) return sendProblem(reply, 503);
        return finishDeletion(reply, await services.confirm({ ...actor, ...request.body }));
      }
      const replay = await services?.replay(request, request.body);
      return finishDeletion(reply, replay ? "deleted" : "unauthorized");
    },
  );
}
