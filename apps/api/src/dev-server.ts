import { loadLocalDemoAuth } from "./local-demo-auth.js";
import { registerDevOutbox } from "./dev-outbox.js";
import { createOutbox } from "./fake-outbox.js";
import { serveApi } from "./serve.js";

const outbox = createOutbox();
const codes = await loadLocalDemoAuth(process.env);
await serveApi({
  ...(codes === undefined ? {} : { codes }),
  configure: (api) => {
    registerDevOutbox(api, outbox);
  },
  sendSms: ({ phone, code }) => {
    outbox.sendSms({ recipientRef: phone, text: code });
  },
  sendInvitation: ({ phone, token }) => {
    outbox.sendSms({ recipientRef: phone, text: token });
  },
});
