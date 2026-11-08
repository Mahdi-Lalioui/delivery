import type { FastifyInstance } from "fastify";
import type { FakeOutbox } from "./fake-outbox.js";
import { requireLoopback } from "./loopback.js";

export function registerDevOutbox(api: FastifyInstance, outbox: FakeOutbox): void {
  api.get(
    "/__dev__/outbox",
    { config: { policy: { kind: "public" } }, onRequest: requireLoopback },
    () => outbox.read(),
  );
}
