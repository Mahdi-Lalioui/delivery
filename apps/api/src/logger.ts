import type { Writable } from "node:stream";
import type { FastifyBaseLogger } from "fastify";
import { pino } from "pino";

const personalFields = new Set([
  "phone",
  "phonee164",
  "phone_e164",
  "contactphone",
  "recipientphone",
  "customerphone",
  "email",
  "emailaddress",
  "email_address",
  "verifiedemail",
  "verifiedphone",
  "code",
  "token",
  "address",
  "location",
]);
const unsafeEntry = '{"level":50,"msg":"Unable to safely serialize log entry"}\n';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function removePersonalFields(entry: Record<string, unknown>): void {
  const pending = [entry];
  for (let record = pending.pop(); record; record = pending.pop()) {
    for (const [key, value] of Object.entries(record)) {
      if (personalFields.has(key.toLowerCase())) {
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
    // Always serialize again, including when a duplicate binding hid a sensitive field from the parser.
    return JSON.stringify(entry) + "\n";
  } catch {
    return unsafeEntry;
  }
}

export function createLogger(stream?: Writable): FastifyBaseLogger {
  // Redact the emitted JSON after serializers, child bindings, and custom JSON conversion.
  return pino({ hooks: { streamWrite: redactLog } }, stream);
}
