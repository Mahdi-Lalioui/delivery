import { openDatabase } from "@zaafran/db/database";
import type { FastifyInstance, FastifyListenOptions } from "fastify";
import { createApi } from "./app.js";
import { readApiEnvironment } from "./environment.js";
import { checkReadiness } from "./readiness.js";

interface StartOptions {
  readonly configure?: (api: FastifyInstance) => void;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly listen?: (api: FastifyInstance, options: FastifyListenOptions) => Promise<string>;
}

export async function startApi(options: StartOptions = {}): Promise<FastifyInstance> {
  const environment = readApiEnvironment(options.environment ?? process.env);
  const database = openDatabase(environment.DATABASE_URL);
  const api = createApi({ checkReadiness: () => checkReadiness(database) });
  api.addHook("onClose", () => database.close());
  try {
    options.configure?.(api);
    const listener = { host: environment.API_HOST, port: environment.API_PORT };
    const listenAddress = await (options.listen
      ? options.listen(api, listener)
      : api.listen(listener));
    api.log.info({ listenAddress }, "API listening");
    return api;
  } catch (error) {
    await api.close();
    throw error;
  }
}
