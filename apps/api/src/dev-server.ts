import { registerDevOutbox } from "./dev-outbox.js";
import { createOutbox } from "./fake-outbox.js";
import { serveApi } from "./serve.js";

const outbox = createOutbox();
await serveApi({
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
