import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { mediaOutput, mediaUploadInput } from "@zaafran/contracts/media";
import type { createMediaRepository } from "@zaafran/db/media";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MediaReservationServices {
  readonly repository: ReturnType<typeof createMediaRepository>;
  readonly now: () => Date;
}

const privatePhotoPolicy = {
  policy: {
    kind: "roles",
    roles: ["customer", "merchant_owner", "merchant_manager", "merchant_staff", "courier"],
  },
} as const;
const readErrors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
const writeErrors = { ...readErrors, 409: problemResponseSchema, 413: problemResponseSchema };

function registerReserve(api: FastifyInstance, services: MediaReservationServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/media/uploads",
    {
      config: privatePhotoPolicy,
      schema: {
        headers: sessionBoundCommandHeaders,
        body: mediaUploadInput,
        response: { 201: mediaOutput, ...writeErrors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const context = resolveSessionCommand({
        request,
        reply,
        services,
        expectedSessionId: request.headers["x-expected-session-id"],
      });
      if (!context) return reply;
      const { accountId, sessionId, now, repository } = context;
      const input =
        request.body.kind === "application"
          ? request.body
          : { ...request.body, merchantId: request.body.merchantId.toLowerCase() };
      const result = await repository.reserve({
        accountId,
        sessionId,
        now,
        input,
        ...commandIdentity(request.headers["idempotency-key"], input),
      });
      if ("media" in result) return reply.code(201).send(result.media);
      if (result.kind === "idempotency_conflict") return sendProblem(reply, 409, result.kind);
      return sendProblem(reply, 404);
    },
  );
}

export function registerMediaReservationRoutes(
  api: FastifyInstance,
  services: MediaReservationServices | undefined,
): void {
  registerReserve(api, services);
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/media/:mediaId",
    {
      config: privatePhotoPolicy,
      schema: {
        params: z.strictObject({ mediaId: z.uuid() }),
        response: { 200: mediaOutput, ...readErrors },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const media = await services.repository.read({
        accountId: actor.accountId,
        sessionId: actor.sessionId,
        mediaId: request.params.mediaId.toLowerCase(),
        now: services.now(),
      });
      return media ? reply.send(media) : sendProblem(reply, 404);
    },
  );
}
