import {
  courierInviteAcceptOutput,
  courierJobsOutput,
  type courierInviteAcceptInput,
} from "@zaafran/contracts/courier";
import { orderSummary } from "@zaafran/contracts/orders";

export type Jobs = ReturnType<typeof courierJobsOutput.parse>;
export type Job = Jobs["jobs"][number];
type Invite = ReturnType<typeof courierInviteAcceptInput.parse>;
type Request = { path: string; body?: object; key?: string; signal?: AbortSignal };
type Failure = { kind: "sign-in" | "forbidden" | "conflict" | "retry" | "error" };
type Result<T> = { kind: "ready"; data: T } | Failure;

function failed(status: number): Failure {
  switch (status) {
    case 401:
      return { kind: "sign-in" };
    case 403:
    case 404:
      return { kind: "forbidden" };
    case 409:
      return { kind: "conflict" };
    case 429:
      return { kind: "retry" };
    default:
      return { kind: status >= 500 ? "retry" : "error" };
  }
}

type ResponseSchema<T> = {
  safeParse: (payload: unknown) => { success: true; data: T } | { success: false };
};

function request<T>(input: Request, schema: ResponseSchema<T>): Promise<Result<T>>;
function request(input: Request): Promise<Result<undefined>>;
async function request<T>(
  { path, body, key, signal }: Request,
  schema?: ResponseSchema<T>,
): Promise<Result<T | undefined>> {
  const deadline = AbortSignal.timeout(12_000);
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
              "content-type": "application/json",
              ...(key ? { "idempotency-key": key } : {}),
            },
          }),
    });
    if (!response.ok) return failed(response.status);
    if (!schema) return { kind: "ready", data: undefined };
    const payload: unknown = await response.json();
    const parsed = schema.safeParse(payload);
    return parsed.success ? { kind: "ready", data: parsed.data } : { kind: "retry" };
  } catch {
    return { kind: "retry" };
  }
}

export function readCourierJobs(signal: AbortSignal) {
  return request({ path: "/v1/courier/jobs", signal }, courierJobsOutput);
}

export function acceptCourierInvite(body: Invite) {
  return request({ path: "/v1/courier/invites/accept", body }, courierInviteAcceptOutput);
}

export function setCourierOnline(online: boolean) {
  return request({ path: "/v1/courier/presence", body: { online } });
}

export function confirmCourierPickup(job: Job, key: string) {
  const { orderId, version } = job.order;
  return request(
    { path: `/v1/orders/${orderId}/pick-up`, body: { expectedVersion: version }, key },
    orderSummary,
  );
}
