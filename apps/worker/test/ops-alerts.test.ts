import { expect, test } from "vitest";
import { createFakeOpsAlertAdapter, createResendOpsAlertAdapter } from "../src/ops-alerts.ts";

test("[NFR-07] fake operations alerts deduplicate stable keys and contain only safe fields", async () => {
  const adapter = createFakeOpsAlertAdapter();
  const alert = {
    key: "ops:failed:synthetic-job",
    taskIdentifier: "ops.watchdog",
    attempts: 1,
    occurredAt: "2026-11-19T22:00:00.000Z",
  };

  await adapter.send(alert);
  await adapter.send(alert);

  expect(adapter.outbox).toEqual([alert]);
  expect(JSON.stringify(adapter.outbox)).not.toContain("payload");
  expect(JSON.stringify(adapter.outbox)).not.toContain("error");
});

test("[NFR-07] Resend alerts use a stable idempotency key and omit payloads and error text", async () => {
  const messages: { to: string; subject: string; text: string; html: string; key: string }[] = [];
  const adapter = createResendOpsAlertAdapter({
    recipient: "ops@example.test",
    send: (message) => {
      messages.push(message);
      return Promise.resolve();
    },
  });
  await adapter({
    key: "ops:job-failed:synthetic-job",
    taskIdentifier: "ops.watchdog",
    attempts: 1,
    occurredAt: "2026-11-19T22:00:00.000Z",
  });

  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    to: "ops@example.test",
    key: "ops:job-failed:synthetic-job",
  });
  expect(JSON.stringify(messages)).not.toContain("payload");
  expect(JSON.stringify(messages)).not.toContain("error");
});

test("[NFR-07] Resend alert HTML escapes task identifiers", async () => {
  const messages: { html: string }[] = [];
  const adapter = createResendOpsAlertAdapter({
    recipient: "ops@example.test",
    send: (message) => {
      messages.push(message);
      return Promise.resolve();
    },
  });

  await adapter({
    key: "ops:job-failed:synthetic-job",
    taskIdentifier: '<img src=x onerror="alert(1)">',
    attempts: 1,
    occurredAt: "2026-11-19T22:00:00.000Z",
  });

  expect(messages[0]?.html).not.toContain("<img");
  expect(messages[0]?.html).toContain("&lt;img");
});
