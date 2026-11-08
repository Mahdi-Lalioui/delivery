import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  type merchantHoursCommandInput,
  type merchantHoursInput,
  merchantHoursOutput,
  type merchantHoursPauseInput,
  merchantHoursPauseOutput,
  merchantHoursPreviewOutput,
  merchantHoursWriteOutput,
  type merchantRamadanCommandInput,
  type merchantRamadanInput,
  merchantRamadanOutput,
} from "@zaafran/contracts/merchant-hours";

export type HoursInput = ReturnType<typeof merchantHoursInput.parse>;
export type RamadanInput = ReturnType<typeof merchantRamadanInput.parse>;
export type StoredHours = ReturnType<typeof merchantHoursOutput.parse>;
export type StoredRamadan = ReturnType<typeof merchantRamadanOutput.parse>;
export type HoursPreview = ReturnType<typeof merchantHoursPreviewOutput.parse>;
export type StoredPause = ReturnType<typeof merchantHoursPauseOutput.parse>;
type Revision = ReturnType<typeof merchantHoursWriteOutput.parse>;
type PreviewSchedule = HoursPreview["schedule"];

type Rejection =
  | "session-changed"
  | "revision-conflict"
  | "pause-in-past"
  | "invalid-hours"
  | "sign-in"
  | "forbidden";
type Failure = { kind: Rejection } | { kind: "rate-limited" | "error"; shouldReuseKey: boolean };
type Read<Data> = { kind: "ready"; data: Data } | { kind: Rejection | "error" };
export type HoursWrite = { kind: "saved"; data: Revision } | Failure;

/** True when the editor must reload before another save can succeed. */
export function isStale(result: HoursWrite): boolean {
  return result.kind === "revision-conflict" || result.kind === "session-changed";
}

const privateRequest = {
  cache: "no-store",
  credentials: "same-origin",
  redirect: "error",
} satisfies RequestInit;

const conflictCodes = new Map<string, Rejection>([
  ["session_changed", "session-changed"],
  ["revision_conflict", "revision-conflict"],
]);

function endpoint(merchantId: string) {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/hours`;
}

async function readProblemCode(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = problemResponseSchema.safeParse(body);
  return parsed.success && parsed.data.status === response.status ? parsed.data.code : undefined;
}

async function classifyFailure(response: Response): Promise<Failure> {
  if (response.status === 401) return { kind: "sign-in" };
  if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
  if (response.status === 429) return { kind: "rate-limited", shouldReuseKey: true };
  const code = await readProblemCode(response);
  if (response.status === 400) {
    return { kind: code === "pause_not_in_future" ? "pause-in-past" : "invalid-hours" };
  }
  const conflict = response.status === 409 && code ? conflictCodes.get(code) : undefined;
  if (conflict) return { kind: conflict };
  return { kind: "error", shouldReuseKey: response.status >= 500 };
}

interface ResponseSchema<Data> {
  safeParse(value: unknown): { success: true; data: Data } | { success: false };
}

async function request<Data>(
  path: string,
  options: RequestInit,
  schema: ResponseSchema<Data>,
): Promise<{ kind: "ok"; data: Data } | Failure> {
  try {
    const response = await fetch(path, { ...options, ...privateRequest });
    if (!response.ok) return await classifyFailure(response);
    const body: unknown = await response.json();
    const result = schema.safeParse(body);
    if (result.success) return { kind: "ok", data: result.data };
  } catch {
    return { kind: "error", shouldReuseKey: true };
  }
  return { kind: "error", shouldReuseKey: true };
}

async function read<Data>(path: string, signal: AbortSignal, schema: ResponseSchema<Data>) {
  const result = await request(path, { signal }, schema);
  if (result.kind === "ok") return { kind: "ready", data: result.data } satisfies Read<Data>;
  return ("shouldReuseKey" in result ? { kind: "error" } : result) satisfies Read<Data>;
}

interface Command<Input> {
  merchantId: string;
  sessionId: string;
  idempotencyKey: string;
  input: Input;
}

async function write<Input>(
  path: string,
  { sessionId, idempotencyKey, input }: Command<Input>,
): Promise<HoursWrite> {
  const headers = {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "x-expected-session-id": sessionId,
  };
  const body = JSON.stringify(input);
  const result = await request(path, { method: "PUT", headers, body }, merchantHoursWriteOutput);
  return result.kind === "ok" ? { kind: "saved", data: result.data } : result;
}

interface ReadRequest {
  merchantId: string;
  signal: AbortSignal;
}

export function readHours({ merchantId, signal }: ReadRequest): Promise<Read<StoredHours>> {
  return read(endpoint(merchantId), signal, merchantHoursOutput);
}

export function readRamadan({ merchantId, signal }: ReadRequest): Promise<Read<StoredRamadan>> {
  return read(endpoint(merchantId) + "/ramadan", signal, merchantRamadanOutput);
}

export function readHoursPause({ merchantId, signal }: ReadRequest): Promise<Read<StoredPause>> {
  return read(endpoint(merchantId) + "/pause", signal, merchantHoursPauseOutput);
}

export async function readHoursPreview({
  merchantId,
  schedule,
  signal,
}: ReadRequest & { schedule: PreviewSchedule }): Promise<Read<HoursPreview>> {
  const path = `${endpoint(merchantId)}/preview?schedule=${schedule}`;
  const result = await read(path, signal, merchantHoursPreviewOutput);
  if (result.kind === "ready" && result.data.schedule !== schedule) return { kind: "error" };
  return result;
}

export function replaceHours(
  command: Command<ReturnType<typeof merchantHoursCommandInput.parse>>,
): Promise<HoursWrite> {
  return write(endpoint(command.merchantId), command);
}

export function replaceRamadan(
  command: Command<ReturnType<typeof merchantRamadanCommandInput.parse>>,
): Promise<HoursWrite> {
  return write(endpoint(command.merchantId) + "/ramadan", command);
}

export function setHoursPause(
  command: Command<ReturnType<typeof merchantHoursPauseInput.parse>>,
): Promise<HoursWrite> {
  return write(endpoint(command.merchantId) + "/pause", command);
}
