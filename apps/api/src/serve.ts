import { startApi, type StartOptions } from "./start.js";

export async function serveApi(options?: StartOptions): Promise<void> {
  try {
    const api = await startApi(options);
    const stop = () => {
      void api.close().catch(() => {
        api.log.error("API shutdown failed");
        process.exitCode = 1;
      });
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch {
    process.stderr.write("API startup failed. Check the listener and environment configuration.\n");
    process.exitCode = 1;
  }
}
