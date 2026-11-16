interface SmsMessage {
  readonly phone: string;
  readonly text: string;
}

/** NOT-04: every SMS leaves the worker through this port. */
export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}

/** Used until Mahdi chooses a provider: jobs that need SMS fail and stay queued for retry. */
export const unavailableSmsSender: SmsSender = {
  send: () => Promise.reject(new Error("SMS delivery is unavailable.")),
};

/** Test adapter that records every message it is asked to send. */
export function createFakeSmsOutbox() {
  const sent: SmsMessage[] = [];
  const sender: SmsSender = {
    send(message) {
      sent.push({ ...message });
      return Promise.resolve();
    },
  };
  return { sender, read: () => [...sent] };
}
