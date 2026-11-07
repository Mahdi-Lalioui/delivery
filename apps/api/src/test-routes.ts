import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { FakeOutbox } from "./fake-outbox.js";
import { requireLoopback } from "./loopback.js";

const localRoute = {
  config: { policy: { kind: "public" as const } },
  onRequest: requireLoopback,
};

export function registerTestRoutes(api: FastifyInstance, outbox: FakeOutbox): () => Date {
  let time: number | undefined;
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.post(
    "/__test__/clock",
    { ...localRoute, schema: { body: z.strictObject({ now: z.iso.datetime() }) } },
    (request) => {
      time = Date.parse(request.body.now);
      return { now: request.body.now };
    },
  );
  routes.post("/__test__/reset", localRoute, (_request, reply) => {
    time = undefined;
    outbox.reset();
    return reply.code(204).send();
  });
  routes.get("/__test__/outbox", localRoute, () => outbox.read());
  return () => new Date(time ?? Date.now());
}
