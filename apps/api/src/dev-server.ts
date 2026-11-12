import { registerDevOutbox } from "./dev-outbox.js";
import { createOutbox } from "./fake-outbox.js";
import { otpCopy } from "./message-copy.js";
import { serveApi } from "./serve.js";

const outbox = createOutbox();
await serveApi({
  configure: (api) => {
    registerDevOutbox(api, outbox);
  },
  sendSms: ({ phone, code, locale }) => {
    outbox.sendSms({ recipientRef: phone, text: otpCopy(locale, code).text });
  },
  sendEmail: ({ email, code, locale }) => {
    const { subject, text } = otpCopy(locale, code);
    outbox.sendEmail({ recipientRef: email, subject, text });
  },
  sendCourierInvitation: ({ phone, token }) => {
    outbox.sendSms({ recipientRef: phone, text: token });
  },
  sendEmailInvitation: ({ email, token }) => {
    outbox.sendEmail({ recipientRef: email, subject: "AWID", text: token });
  },
  sendInvitation: ({ phone, token }) => {
    outbox.sendSms({ recipientRef: phone, text: token });
  },
});
