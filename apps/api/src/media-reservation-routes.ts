import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { sessionBoundCommandHeaders } from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { mediaOutput, mediaUploadInput, photoUploadMaximumBytes } from "@zaafran/contracts/media";
import type {
  createMediaRepository,
  MediaAdoptionResult,
  MediaUploadDescriptor,
} from "@zaafran/db/media";
import type { MediaStore } from "@zaafran/media";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commandIdentity, resolveSessionCommand } from "./command-identity.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface MediaReservationServices {
  readonly repository: ReturnType<typeof createMediaRepository>;
  readonly store: MediaStore;
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
const uploadErrors = { ...writeErrors, 415: problemResponseSchema };
const mediaIdParams = z.strictObject({ mediaId: z.uuid() });

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

function isKnownAdoptionFailure(kind: string): kind is "content_mismatch" | "upload_conflict" {
  return kind === "content_mismatch" || kind === "upload_conflict";
}

function readContentEncodingError(request: { headers: Record<string, unknown> }) {
  if (request.headers["content-encoding"] === undefined) return undefined;
  return Object.assign(new Error("Unsupported content encoding"), { statusCode: 415 });
}

function readOversizeError(request: { headers: Record<string, unknown> }) {
  const declared = Number(request.headers["content-length"]);
  if (!Number.isFinite(declared) || declared <= photoUploadMaximumBytes) return undefined;
  return Object.assign(new Error("Upload exceeds the photo size limit"), { statusCode: 413 });
}

interface UploadedBody {
  readonly body: Buffer;
  readonly contentType: MediaUploadDescriptor["contentType"];
  readonly mediaId: string;
}

async function quarantineAndAdopt(
  services: MediaReservationServices,
  context: { accountId: string; sessionId: string; now: Date },
  upload: UploadedBody,
): Promise<MediaAdoptionResult | { kind: "adoption_failed" }> {
  const { accountId, sessionId, now } = context;
  const { body, contentType, mediaId } = upload;
  const digest = createHash("sha256").update(body).digest();
  const quarantineKey = `quarantine/${mediaId}/${randomUUID()}`;
  await services.store.put({
    key: quarantineKey,
    body: Readable.from(body),
    bytes: body.length,
    checksumSha256: digest.toString("base64"),
  });

  let result: MediaAdoptionResult;
  try {
    result = await services.repository.acceptUpload({
      accountId,
      sessionId,
      mediaId,
      now,
      contentType,
      bytes: body.length,
      digest,
      quarantineKey,
    });
  } catch {
    return { kind: "adoption_failed" };
  }

  if (result.kind === "replayed" || isKnownAdoptionFailure(result.kind)) {
    await services.store.delete(quarantineKey);
  }
  return result;
}

function registerUploadContent(
  api: FastifyInstance,
  services: MediaReservationServices | undefined,
) {
  void api.register((instance) => {
    instance.removeContentTypeParser("application/json");
    instance.addContentTypeParser(
      "application/octet-stream",
      { parseAs: "buffer" },
      (request, payload, done) => {
        const rejection = readContentEncodingError(request) ?? readOversizeError(request);
        if (rejection) {
          done(rejection);
          return;
        }
        done(null, payload);
      },
    );
    instance.withTypeProvider<ZodTypeProvider>().put(
      "/v1/media/uploads/:mediaId/content",
      {
        config: privatePhotoPolicy,
        bodyLimit: photoUploadMaximumBytes,
        schema: {
          headers: z.object({ "x-expected-session-id": z.uuid() }),
          params: mediaIdParams,
          response: { 202: mediaOutput, ...uploadErrors },
        },
      },
      async (request, reply) => {
        reply.header("cache-control", "no-store");
        if (!services) return sendProblem(reply, 503);
        const context = resolveSessionCommand({
          request,
          reply,
          services,
          expectedSessionId: request.headers["x-expected-session-id"],
        });
        if (!context) return reply;
        const { accountId, sessionId, now, repository } = context;
        const mediaId = request.params.mediaId.toLowerCase();
        const descriptor = await repository.findUpload({ accountId, sessionId, mediaId, now });
        if (!descriptor) return sendProblem(reply, 404);
        const { body } = request;
        if (!Buffer.isBuffer(body) || body.length !== descriptor.bytes) {
          return sendProblem(reply, 400);
        }

        const result = await quarantineAndAdopt(
          services,
          { accountId, sessionId, now },
          {
            body,
            contentType: descriptor.contentType,
            mediaId,
          },
        );
        if (result.kind === "adoption_failed") {
          request.log.error("Unhandled media adoption failure");
          return sendProblem(reply, 500);
        }
        if ("media" in result) return reply.code(202).send(result.media);
        if (isKnownAdoptionFailure(result.kind)) return sendProblem(reply, 409, result.kind);
        return sendProblem(reply, 404);
      },
    );
  });
}

export function registerMediaReservationRoutes(
  api: FastifyInstance,
  services: MediaReservationServices | undefined,
): void {
  registerReserve(api, services);
  registerUploadContent(api, services);
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/media/:mediaId",
    {
      config: privatePhotoPolicy,
      schema: {
        params: mediaIdParams,
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
