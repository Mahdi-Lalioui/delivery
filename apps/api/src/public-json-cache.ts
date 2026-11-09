import { createHash } from "node:crypto";
import type { onSendAsyncHookHandler } from "fastify";

function matchesValidator(value: string | undefined, tag: string) {
  if (value?.trim() === "*") return true;
  return value?.split(",").some((candidate) => {
    const validator = candidate.trim();
    return validator === tag || validator === "W/" + tag;
  });
}

export const revalidatePublicJson: onSendAsyncHookHandler = (request, reply, payload) => {
  if (reply.statusCode !== 200 || typeof payload !== "string") {
    reply.header("cache-control", "no-store");
    return Promise.resolve(payload);
  }

  const tag = '"' + createHash("sha256").update(payload).digest("hex") + '"';
  reply.header("cache-control", "private, no-cache").header("etag", "W/" + tag);
  if (matchesValidator(request.headers["if-none-match"], tag)) {
    reply.code(304).removeHeader("content-type");
    return Promise.resolve(null);
  }
  return Promise.resolve(payload);
};
