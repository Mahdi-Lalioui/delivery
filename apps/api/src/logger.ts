import type { Writable } from "node:stream";
import type { FastifyBaseLogger } from "fastify";
import { pino } from "pino";

const personalFields = [
  "phone",
  "code",
  "token",
  "address.*",
  "location",
  "*.phone",
  "*.code",
  "*.token",
  "*.address.*",
  "*.location",
];

export function createLogger(stream?: Writable): FastifyBaseLogger {
  return pino({ redact: { paths: personalFields, remove: true } }, stream);
}
