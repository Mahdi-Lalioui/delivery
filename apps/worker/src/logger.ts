import { Logger } from "graphile-worker";
import { pino } from "pino";

export const workerLogger = pino({ name: "zaafran-worker" });

export const queueLogger = new Logger(({ label, jobId, taskIdentifier, workerId }) => {
  return (level, _message, meta) => {
    // Upstream messages and metadata can contain credentials, SQL, or job payloads.
    const context = { label, jobId, taskIdentifier, workerId };
    const message = meta.failure === true ? "Job attempt failed" : "Graphile Worker event";
    const logLevel = level === "warning" ? "warn" : level;
    workerLogger[logLevel](context, message);
  };
});
