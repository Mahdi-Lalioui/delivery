export interface AuthHarness {
  readonly origin: string;
  close(): Promise<void>;
  advanceClock(milliseconds: number): void;
  latestSms(phone: string): string;
  phoneForSession(sessionId: string): Promise<string | undefined>;
  seedAdmin(phone: string): Promise<() => string>;
}
