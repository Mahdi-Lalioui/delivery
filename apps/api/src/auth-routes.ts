import {
  idempotencyKeySchema,
  logoutInput,
  requestOtpInput,
  requestOtpOutput,
  sessionIdParams,
  sessionListOutput,
  verifyOtpInput,
  verifyOtpOutput,
  verifyTotpInput,
  verifyTotpOutput,
} from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AuthAccess } from "./auth-access.js";
import type { AuthService } from "./auth-service.js";
import {
  clearSessionCookie,
  hasSameOrigin,
  isNativeTransport,
  sessionCookie,
} from "./auth-transport.js";
import { sendProblem } from "./problems.js";

type VerificationResult = Awaited<ReturnType<AuthService["verifyOtp"]>>;
type AuthFailure = Extract<VerificationResult, { ok: false }>;

const publicConfig = { policy: { kind: "public" as const } };
const sessionConfig = {
  policy: {
    kind: "roles",
    roles: ["customer", "merchant_owner", "merchant_manager", "merchant_staff", "courier", "admin"],
  },
} as const;
const commandHeaders = z.object({ "idempotency-key": idempotencyKeySchema });
const authErrors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  410: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

function failureStatus(code: AuthFailure["code"]): number {
  if (code === "otp_delivery_unavailable") return 503;
  if (code.endsWith("_invalid")) return 401;
  if (code.endsWith("_expired")) return 410;
  if (code.endsWith("_locked") || code === "otp_rate_limited") return 429;
  return 409;
}

function sendAuthFailure(reply: FastifyReply, failure: AuthFailure): FastifyReply {
  if (failure.retryAfterSeconds !== undefined)
    reply.header("retry-after", failure.retryAfterSeconds.toString());
  return sendProblem(reply, failureStatus(failure.code), failure.code);
}

function noStore(reply: FastifyReply): void {
  reply.header("cache-control", "no-store");
}

function replyToVerification(reply: FastifyReply, result: VerificationResult): FastifyReply {
  if (!result.ok) return sendAuthFailure(reply, result);
  const issued = result.value;
  if (issued.kind === "totp_required")
    return reply.send({
      status: "totp_required",
      challengeId: issued.challengeId,
      expiresInSeconds: 300,
    });
  if (issued.transport === "bearer")
    return reply.send({ status: "authenticated", transport: "bearer", token: issued.token });

  reply.header(
    "set-cookie",
    sessionCookie({ token: issued.token, now: issued.now, expiresAt: issued.session.expiresAt }),
  );
  return reply.send({ status: "authenticated", transport: "web" });
}

function deviceMetadata(request: FastifyRequest) {
  const deviceName = request.headers["user-agent"]?.trim().slice(0, 120) || null;
  return { requestIp: request.ip, deviceName };
}

function registerOtpRequest(api: FastifyInstance, { auth }: AuthAccess): void {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/auth/otp/request",
    {
      config: publicConfig,
      schema: {
        headers: commandHeaders,
        body: requestOtpInput,
        response: { 202: requestOtpOutput, ...authErrors },
      },
    },
    async (request, reply) => {
      noStore(reply);
      if (!auth) return sendProblem(reply, 503);
      if (!isNativeTransport(request.headers) && !hasSameOrigin(request.headers, auth.publicOrigin))
        return sendProblem(reply, 403);
      const result = await auth.service.requestOtp({
        ...request.body,
        requestIp: request.ip,
        idempotencyKey: request.headers["idempotency-key"],
      });
      return result.ok ? reply.code(202).send(result.value) : sendAuthFailure(reply, result);
    },
  );
}

function registerVerification(
  api: FastifyInstance,
  { auth }: AuthAccess,
  factor: "otp" | "totp",
): void {
  const isTotp = factor === "totp";
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/auth/" + factor + "/verify",
    {
      config: publicConfig,
      schema: {
        headers: commandHeaders,
        body: isTotp ? verifyTotpInput : verifyOtpInput,
        response: { 200: isTotp ? verifyTotpOutput : verifyOtpOutput, ...authErrors },
      },
    },
    async (request, reply) => {
      noStore(reply);
      if (!auth) return sendProblem(reply, 503);
      const allowed =
        request.body.transport === "web"
          ? hasSameOrigin(request.headers, auth.publicOrigin)
          : isNativeTransport(request.headers);
      if (!allowed) return sendProblem(reply, 403);
      const input = {
        ...request.body,
        ...deviceMetadata(request),
        idempotencyKey: request.headers["idempotency-key"],
      };
      const result = isTotp
        ? await auth.service.verifyTotp(input)
        : await auth.service.verifyOtp(input);
      return replyToVerification(reply, result);
    },
  );
}

function registerDeviceRoutes(api: FastifyInstance, { auth, getSession }: AuthAccess): void {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/me/sessions",
    { config: sessionConfig, schema: { response: { 200: sessionListOutput, ...authErrors } } },
    async (request, reply) => {
      noStore(reply);
      const session = getSession(request);
      if (!session) return sendProblem(reply, 401);
      if (!auth) return sendProblem(reply, 503);
      return reply.send(await auth.service.listSessions(session));
    },
  );
  routes.delete(
    "/v1/me/sessions/:sessionId",
    {
      config: sessionConfig,
      schema: { params: sessionIdParams, response: { 204: z.null(), ...authErrors } },
    },
    async (request, reply) => {
      noStore(reply);
      const session = getSession(request);
      if (!session) return sendProblem(reply, 401);
      if (!auth) return sendProblem(reply, 503);
      const { sessionId } = request.params;
      const count = await auth.service.revokeSessions(session, { kind: "one", sessionId });
      if (!count) return sendProblem(reply, 404);
      if (sessionId === session.id && session.transport === "web")
        reply.header("set-cookie", clearSessionCookie);
      return reply.code(204).send(null);
    },
  );
}

function registerLogout(api: FastifyInstance, { auth, getSession }: AuthAccess): void {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/auth/logout",
    {
      config: sessionConfig,
      schema: {
        headers: commandHeaders,
        body: logoutInput,
        response: { 204: z.null(), ...authErrors },
      },
    },
    async (request, reply) => {
      noStore(reply);
      const session = getSession(request);
      if (!session) return sendProblem(reply, 401);
      if (!auth) return sendProblem(reply, 503);
      const scope =
        request.body.scope === "all"
          ? { kind: "all" as const }
          : { kind: "one" as const, sessionId: session.id };
      await auth.service.revokeSessions(session, scope);
      if (session.transport === "web") reply.header("set-cookie", clearSessionCookie);
      return reply.code(204).send(null);
    },
  );
}

export function registerAuthRoutes(api: FastifyInstance, access: AuthAccess): void {
  registerOtpRequest(api, access);
  registerVerification(api, access, "otp");
  registerVerification(api, access, "totp");
  registerDeviceRoutes(api, access);
  registerLogout(api, access);
}
