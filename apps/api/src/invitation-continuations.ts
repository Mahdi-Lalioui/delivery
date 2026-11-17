import { courierInviteAcceptInput } from "@zaafran/contracts/courier";
import { problemResponseSchema } from "@zaafran/contracts/health";
import { staffInvitationAcceptInput } from "@zaafran/contracts/merchant-staff";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onSendAsyncHookHandler,
} from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { readRequestCredential } from "./auth-access.js";
import { hasSameOrigin } from "./auth-transport.js";
import { sendProblem } from "./problems.js";

const kindSchema = z.enum(["staff", "courier"]);
type Kind = z.infer<typeof kindSchema>;
const params = z.strictObject({ kind: kindSchema });
const config = { policy: { kind: "public" } } as const;
const path = "/v1/invitation-continuations/:kind";
const cookieMaxAge = 900;
const noStore: onSendAsyncHookHandler = (_request, reply, payload) => {
  reply.header("cache-control", "no-store");
  return Promise.resolve(payload);
};

function validToken(kind: Kind, token: string | undefined) {
  return kind === "staff"
    ? staffInvitationAcceptInput.shape.token.safeParse(token)
    : courierInviteAcceptInput.shape.inviteId.safeParse(token);
}

function writeCookie(
  reply: FastifyReply,
  kind: Kind,
  { value, maxAge }: { value: string; maxAge: number },
) {
  reply.header(
    "set-cookie",
    `__Host-${kind}-invitation=${value}; Path=/; Max-Age=${maxAge.toString()}; Secure; HttpOnly; SameSite=Strict`,
  );
}

function readCookie(request: FastifyRequest, kind: Kind) {
  const prefix = `__Host-${kind}-invitation=`;
  const matches = request.headers.cookie
    ?.split(";")
    .map((field) => field.trim())
    .filter((field) => field.startsWith(prefix));
  if (matches?.length !== 1) return undefined;
  const result = validToken(kind, matches[0]?.slice(prefix.length));
  return result.success ? result.data : undefined;
}

export function readWebInvitation(request: FastifyRequest, kind: Kind) {
  if (readRequestCredential(request)?.transport !== "web") return undefined;
  return readCookie(request, kind);
}

export function clearWebInvitation(reply: FastifyReply, kind: Kind) {
  writeCookie(reply, kind, { value: "", maxAge: 0 });
}

export function registerInvitationContinuations(api: FastifyInstance, publicOrigin?: string) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.post(
    path,
    {
      config,
      onSend: noStore,
      schema: {
        params,
        body: z.strictObject({ token: z.string().max(43) }),
        response: {
          204: z.void(),
          400: problemResponseSchema,
          403: problemResponseSchema,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (publicOrigin === undefined) return sendProblem(reply, 503);
      if (!hasSameOrigin(request.headers, publicOrigin)) return sendProblem(reply, 403);
      const { kind } = request.params;
      const token = validToken(kind, request.body.token);
      if (!token.success) return sendProblem(reply, 400);
      writeCookie(reply, kind, { value: token.data, maxAge: cookieMaxAge });
      return reply.code(204).send();
    },
  );

  routes.get(
    path,
    {
      config,
      onSend: noStore,
      schema: {
        params,
        response: { 200: z.strictObject({ pending: z.boolean() }), 429: problemResponseSchema },
      },
    },
    (request) => ({ pending: readCookie(request, request.params.kind) !== undefined }),
  );
}
