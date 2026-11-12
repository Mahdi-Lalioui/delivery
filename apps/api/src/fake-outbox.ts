interface SmsMessage {
  readonly recipientRef: string;
  readonly text: string;
}

interface EmailMessage extends SmsMessage {
  readonly subject: string;
}

interface PushMessage {
  readonly recipientRef: string;
  readonly title: string;
  readonly body: string;
}

export function createOutbox() {
  const sms: SmsMessage[] = [];
  const email: EmailMessage[] = [];
  const push: PushMessage[] = [];
  return {
    sendSms(message: SmsMessage): void {
      sms.push({ ...message });
    },
    sendEmail(message: EmailMessage): void {
      email.push({ ...message });
    },
    sendPush(message: PushMessage): void {
      push.push({ ...message });
    },
    read() {
      return { sms: [...sms], email: [...email], push: [...push] };
    },
    reset(): void {
      sms.length = 0;
      email.length = 0;
      push.length = 0;
    },
  };
}

export type FakeOutbox = ReturnType<typeof createOutbox>;
