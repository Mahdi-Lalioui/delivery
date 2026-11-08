import type { MediaObject } from "@zaafran/media";
import type { FastifyReply } from "fastify";
import { z } from "zod";

export const binaryImage = { schema: z.string().meta({ format: "binary" }) };

// Fastify sends streams directly. The binary schema describes the HTTP representation.
export function sendImage(reply: FastifyReply, object: MediaObject, contentType: string) {
  return reply
    .type(contentType)
    .header("x-content-type-options", "nosniff")
    .header("content-length", object.bytes)
    .send(object.body);
}
