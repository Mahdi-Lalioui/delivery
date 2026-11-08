import { z } from "zod";
import { workerLogger } from "./logger.js";

const workerEnvironment = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
});

export async function runWorkerCommand(
  command: "start" | "migrate",
  execute: (databaseUrl: string) => Promise<void>,
): Promise<void> {
  const environment = workerEnvironment.safeParse(process.env);
  if (!environment.success) {
    workerLogger.error({ command }, "DATABASE_URL must be a valid PostgreSQL URL");
    process.exitCode = 1;
    return;
  }

  try {
    await execute(environment.data.DATABASE_URL);
  } catch {
    workerLogger.error({ command }, "Worker command failed");
    process.exitCode = 1;
  }
}
