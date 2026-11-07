import { registerDevOutbox } from "./dev-outbox.js";
import { createOutbox } from "./fake-outbox.js";
import { serveApi } from "./serve.js";

await serveApi((api) => {
  registerDevOutbox(api, createOutbox());
});
