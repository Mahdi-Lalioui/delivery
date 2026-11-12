import { openDatabase } from "@zaafran/db/database";
import { createLocalMediaStore } from "@zaafran/media";
import { createResendSender, createTwilioSender } from "@zaafran/notifications";
import { run } from "graphile-worker";
import { runWorkerCommand, type WorkerEnvironment } from "./command.js";
import { createOrderPushAdapter } from "./order-push-adapter.js";
import { createOrderSmsAdapter, type SendOrderSms } from "./order-sms-adapter.js";
import { workerLogger } from "./logger.js";
import { createWorkerOptions } from "./runtime.js";

async function serveWorker(
  databaseUrl: string,
  media: Parameters<typeof createWorkerOptions>[2],
): Promise<void> {
  const database = openDatabase(databaseUrl);
  const shutdown = Promise.withResolvers<"signal">();
  const requestShutdown = () => {
    shutdown.resolve("signal");
  };
  process.on("SIGINT", requestShutdown);
  process.on("SIGTERM", requestShutdown);

  try {
    const runner = await run({
      ...createWorkerOptions(databaseUrl, database, media),
      noHandleSignals: true,
    });
    runner.events.on("job:failed", ({ job }) => {
      workerLogger.error(
        { jobId: job.id, taskIdentifier: job.task_identifier, attempts: job.attempts },
        "Job exhausted its retries",
      );
    });

    const completion = await Promise.race([runner.promise, shutdown.promise]);
    if (completion === "signal") await runner.stop().finally(() => runner.promise);
  } finally {
    process.off("SIGINT", requestShutdown);
    process.off("SIGTERM", requestShutdown);
    await database.close();
  }
}

function configureSms(environment: WorkerEnvironment): SendOrderSms | undefined {
  const {
    AUTH_TWILIO_ACCOUNT_SID: accountSid,
    AUTH_TWILIO_AUTH_TOKEN: authToken,
    AUTH_TWILIO_FROM: from,
    ORDER_SMS_WEBHOOK_URL: url,
    ORDER_SMS_WEBHOOK_TOKEN: token,
  } = environment;
  if (accountSid && authToken && from) {
    const send = createTwilioSender({ accountSid, authToken, from });
    return ({ recipient, text, key }) => send({ to: recipient, text, key });
  }
  return url && token ? createOrderSmsAdapter({ url, token }) : undefined;
}

await runWorkerCommand("start", (environment) => {
  const {
    DATABASE_URL,
    MEDIA_STORAGE_ROOT,
    HEIC_DECODER_PATH,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT,
    AUTH_RESEND_API_KEY: apiKey,
    AUTH_RESEND_FROM: from,
  } = environment;
  return serveWorker(DATABASE_URL, {
    store: createLocalMediaStore({ root: MEDIA_STORAGE_ROOT }),
    heicDecoderPath: HEIC_DECODER_PATH,
    orderPush:
      VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT
        ? createOrderPushAdapter({
            subject: VAPID_SUBJECT,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          })
        : undefined,
    orderSms: configureSms(environment),
    orderEmail: apiKey && from ? createResendSender({ apiKey, from: `AWID <${from}>` }) : undefined,
  });
});
