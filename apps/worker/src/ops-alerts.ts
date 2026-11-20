import type { createResendSender } from "@zaafran/notifications";
import type { WorkerEventMap, WorkerEvents } from "graphile-worker";

export type OpsAlert = {
  key: string;
  taskIdentifier: string;
  attempts: number;
  occurredAt: string;
};

export type SendOpsAlert = (alert: OpsAlert) => Promise<void>;
export type OpsAlertFailureLogger = (alert: OpsAlert) => void;

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function createFakeOpsAlertAdapter() {
  const outbox: OpsAlert[] = [];
  const delivered = new Set<string>();

  return {
    outbox,
    send: (alert: OpsAlert) => {
      if (delivered.has(alert.key)) return Promise.resolve();
      delivered.add(alert.key);
      outbox.push({ ...alert });
      return Promise.resolve();
    },
  };
}

export function createResendOpsAlertAdapter({
  recipient,
  send,
}: {
  recipient: string;
  send: ReturnType<typeof createResendSender>;
}): SendOpsAlert {
  return (alert) => {
    const text = [
      "An AWID background job exhausted its retries.",
      `Task: ${alert.taskIdentifier}`,
      `Attempts: ${String(alert.attempts)}`,
      `Time: ${alert.occurredAt}`,
    ].join("\n");
    return send({
      to: recipient,
      subject: "AWID background job alert",
      text,
      html: `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`,
      key: alert.key,
    });
  };
}

export function attachWorkerFailureAlerts(
  events: WorkerEvents,
  send: SendOpsAlert,
  logFailure: OpsAlertFailureLogger = () => undefined,
) {
  const onFailed = ({ job }: WorkerEventMap["job:failed"]) => {
    const alert = {
      key: `ops:job-failed:${job.id}`,
      taskIdentifier: job.task_identifier,
      attempts: job.attempts,
      occurredAt: new Date().toISOString(),
    };
    void Promise.resolve()
      .then(() => send(alert))
      .catch(() => {
        logFailure(alert);
      });
  };
  events.on("job:failed", onFailed);
  return () => {
    events.off("job:failed", onFailed);
  };
}

export function createTelegramOpsAlertAdapter(
  token: string,
  chatId: string,
  fetcher = fetch,
): SendOpsAlert {
  return async ({ attempts, occurredAt }) => {
    const response = await fetcher("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text:
          "AWID background job exhausted " + String(attempts) + " attempts at " + occurredAt + ".",
      }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Telegram alert delivery failed");
  };
}

export function combineOpsAlerts(
  ...adapters: (SendOpsAlert | undefined)[]
): SendOpsAlert | undefined {
  if (!adapters.some(Boolean)) return undefined;
  return async (alert) => {
    await Promise.all(adapters.map(async (send) => send?.(alert)));
  };
}
