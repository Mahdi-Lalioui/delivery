import { randomInt } from "node:crypto";
import { Readable } from "node:stream";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { merchantBoardCursor, orderRealtimeQuery } from "@zaafran/contracts/orders";
import type { createOrderRepository } from "@zaafran/db/orders";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getRequestActor, type Actor } from "./policy.js";
import { sendProblem } from "./problems.js";
import { createRealtimeWakeup } from "./realtime-wakeup.js";

type Replay = ReturnType<typeof createOrderRepository>["merchantReplay"];
type Batch = NonNullable<Awaited<ReturnType<Replay>>>;
type StreamServices = {
  replay: Replay;
  replayOrder: ReturnType<typeof createOrderRepository>["orderReplay"];
  subscribeOrder: (orderId: string, wake: () => void) => () => void;
  subscribe: (merchantId: string, wake: () => void) => () => void;
};
type Stream = {
  first: Batch;
  next: (after: string) => ReturnType<Replay>;
  wait: () => Promise<void>;
  signal: AbortSignal;
  close: () => void;
};

async function* streamOrders({ first, next, wait, signal, close }: Stream) {
  try {
    yield "retry: " + String(randomInt(2_500, 5_001)) + "\n\n";
    const aborted = () => signal.aborted;
    let batch: Batch | undefined = first;
    while (batch && !aborted()) {
      for (const event of batch.events) {
        yield "id: " + event.id + "\nevent: order\ndata: " + JSON.stringify(event) + "\n\n";
      }
      if (!batch.hasMore) {
        yield ": heartbeat\n\n";
        await wait();
      }
      if (aborted()) break;
      batch = await next(batch.cursor);
    }
  } finally {
    close();
  }
}

function sendEventStream(reply: FastifyReply, body: Readable) {
  return reply
    .header("cache-control", "no-store, no-transform")
    .header("x-accel-buffering", "no")
    .type("text/event-stream; charset=utf-8")
    .send(body);
}

const merchantRoles = ["customer", "merchant_owner", "merchant_manager", "merchant_staff"] as const;
const merchantRoleSet = new Set<string>(merchantRoles);

function selectTopic(
  services: StreamServices,
  query: z.infer<typeof orderRealtimeQuery>,
  actor: Actor,
) {
  const { accountId, sessionId, role } = actor;
  if (query.topic === "merchantOrders") {
    const merchantId = query.merchantId.toLowerCase();
    return {
      replay: (after: string | undefined) =>
        services.replay({ accountId, sessionId, merchantId, after }),
      subscribe: (wake: () => void) => services.subscribe(merchantId, wake),
    };
  }
  if (role === "courier") return undefined;
  const orderId = query.orderId.toLowerCase();
  return {
    replay: (after: string | undefined) =>
      services.replayOrder({
        orderId,
        accountId,
        sessionId,
        role: role === "customer" ? "standard" : role,
        after,
      }),
    subscribe: (wake: () => void) => services.subscribeOrder(orderId, wake),
  };
}

export function registerRealtimeRoutes(api: FastifyInstance, services?: StreamServices) {
  const active = new Map<string, Set<AbortController>>();
  api.addHook("preClose", (done) => {
    for (const sessions of active.values()) {
      for (const controller of sessions) controller.abort();
    }
    done();
  });

  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/realtime",
    {
      config: {
        policy: { kind: "roles", roles: [...merchantRoles, "admin"] },
      },
      schema: {
        querystring: orderRealtimeQuery,
        headers: z.object({ "last-event-id": merchantBoardCursor.optional() }),
        response: {
          200: { content: { "text/event-stream": { schema: z.string() } } },
          400: problemResponseSchema,
          401: problemResponseSchema,
          403: problemResponseSchema,
          404: problemResponseSchema,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (request.query.topic === "merchantOrders" && !merchantRoleSet.has(actor.role))
        return sendProblem(reply, 403);
      if (!services) return sendProblem(reply, 503);
      const { sessionId } = actor;
      const topic = selectTopic(services, request.query, actor);
      if (!topic) return sendProblem(reply, 403);
      const streams = active.get(sessionId) ?? new Set<AbortController>();
      if (streams.size >= 4) return sendProblem(reply, 429);
      const controller = new AbortController();
      streams.add(controller);
      active.set(sessionId, streams);
      const wake = createRealtimeWakeup(controller.signal);
      const unsubscribe = topic.subscribe(() => {
        wake.notify();
      });
      function close() {
        if (!streams.delete(controller)) return;
        controller.abort();
        unsubscribe();
        if (streams.size === 0) active.delete(sessionId);
      }

      reply.raw.once("close", close);
      const { after } = request.query;
      const first = await topic.replay(request.headers["last-event-id"] ?? after);
      if (!first) {
        close();
        return sendProblem(reply, 404);
      }
      const body = Readable.from(
        streamOrders({
          first,
          next: (cursor) => topic.replay(cursor),
          wait: () => wake.wait(),
          signal: controller.signal,
          close,
        }),
      );
      return sendEventStream(reply, body);
    },
  );
}
