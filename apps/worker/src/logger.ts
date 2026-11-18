import type { Writable } from "node:stream";
import { Logger } from "graphile-worker";
import { pino } from "pino";

const personalFields = new Set([
  "phone",
  "phonee164",
  "contactphone",
  "recipientphone",
  "customerphone",
  "email",
  "emailaddress",
  "verifiedemail",
  "verifiedphone",
  "code",
  "token",
  "address",
  "location",
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "contactphonee164",
  "addresssnapshot",
  "refreshtoken",
  "accesstoken",
  "sessiontoken",
  "idempotencykey",
]);
const unsafeEntry = '{"level":50,"msg":"Unable to safely serialize log entry"}\n';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function removePersonalFields(entry: Record<string, unknown>): void {
  const pending = [entry];
  for (let record = pending.pop(); record; record = pending.pop()) {
    for (const [key, value] of Object.entries(record)) {
      if (personalFields.has(key.toLowerCase().replace(/[-_]/gu, ""))) {
        Reflect.deleteProperty(record, key);
      } else if (isRecord(value)) {
        pending.push(value);
      }
    }
  }
}

function redactLog(line: string): string {
  try {
    const entry: unknown = JSON.parse(line);
    if (!isRecord(entry)) return unsafeEntry;
    removePersonalFields(entry);
    return `${JSON.stringify(entry)}\n`;
  } catch {
    return unsafeEntry;
  }
}

export function createWorkerLogger(stream?: Writable) {
  return pino({ name: "zaafran-worker", hooks: { streamWrite: redactLog } }, stream);
}

export const workerLogger = createWorkerLogger();

export const queueLogger = new Logger(({ label, jobId, taskIdentifier, workerId }) => {
  return (level, _message, meta) => {
    // Upstream messages and metadata can contain credentials, SQL, or job payloads.
    const context = { label, jobId, taskIdentifier, workerId };
    const message = meta.failure === true ? "Job attempt failed" : "Graphile Worker event";
    const logLevel = level === "warning" ? "warn" : level;
    workerLogger[logLevel](context, message);
  };
});
