// Pure subscription billing rules (SPEC §11). Dates are calendar dates in Africa/Algiers
// ("YYYY-MM-DD"); the caller converts the clock to a local date before calling.

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";
export type SubscriptionEvent =
  "period_started" | "overdue" | "grace_expired" | "payment_recorded" | "cancel_requested";

export type BillingSettings = {
  readonly priceDzd: number;
  readonly trialDays: number;
  readonly dueAfterDays: number;
  readonly graceDays: number;
};

export type BillingSubscription = {
  readonly subscriptionId: string;
  readonly status: SubscriptionStatus;
  readonly nextPeriodStart: string;
  readonly isDemo: boolean;
};

export type OpenInvoice = {
  readonly invoiceId: string;
  readonly issuedOn: string;
  readonly sentReminderDays: readonly number[];
};

export type BillingAction =
  | {
      readonly kind: "issue_invoice";
      readonly idempotencyKey: string;
      readonly periodStart: string;
      readonly periodEnd: string;
      readonly amountDzd: number;
      readonly dueOn: string;
    }
  | { readonly kind: "send_reminder"; readonly invoiceId: string; readonly day: number }
  | { readonly kind: "transition"; readonly event: SubscriptionEvent };

type TransitionResult =
  | { readonly ok: true; readonly value: SubscriptionStatus }
  | { readonly ok: false; readonly error: { readonly code: "illegal_subscription_transition" } };

const reminderDays = [0, 5, 7, 12] as const;
const dayMs = 86_400_000;

const transitions: Readonly<
  Record<SubscriptionEvent, Partial<Record<SubscriptionStatus, SubscriptionStatus>>>
> = {
  period_started: { trialing: "active", active: "active" },
  overdue: { active: "past_due" },
  grace_expired: { past_due: "suspended" },
  payment_recorded: { active: "active", past_due: "active", suspended: "active" },
  cancel_requested: {
    trialing: "cancelled",
    active: "cancelled",
    past_due: "cancelled",
    suspended: "cancelled",
  },
};

export function transitionSubscription(
  status: SubscriptionStatus,
  event: SubscriptionEvent,
): TransitionResult {
  const next = transitions[event][status];
  if (next === undefined) return { ok: false, error: { code: "illegal_subscription_transition" } };
  return { ok: true, value: next };
}

function parseDate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())) {
    throw new RangeError(`invalid calendar date: ${date}`);
  }
  return parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, days: number): string {
  return formatDate(new Date(parseDate(date).getTime() + days * dayMs));
}

export function addCalendarMonth(date: string): string {
  const start = parseDate(date);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / dayMs);
}

export function formatInvoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new RangeError("invoice sequence must be an integer between 1 and 999999");
  }
  return `${String(year)}-${String(sequence).padStart(6, "0")}`;
}

function planInvoice(input: {
  subscription: BillingSubscription;
  today: string;
  settings: BillingSettings;
}): BillingAction[] {
  const { subscription, today, settings } = input;
  if (daysBetween(subscription.nextPeriodStart, today) < 0) return [];
  const periodStart = subscription.nextPeriodStart;
  const issue: BillingAction = {
    kind: "issue_invoice",
    idempotencyKey: `${subscription.subscriptionId}:${periodStart}`,
    periodStart,
    periodEnd: addCalendarMonth(periodStart),
    amountDzd: settings.priceDzd,
    dueOn: addCalendarDays(periodStart, settings.dueAfterDays),
  };
  return [issue, { kind: "transition", event: "period_started" }];
}

function planCollection(input: {
  subscription: BillingSubscription;
  invoice: OpenInvoice;
  today: string;
  settings: BillingSettings;
}): BillingAction[] {
  const { subscription, invoice, today, settings } = input;
  const age = daysBetween(invoice.issuedOn, today);
  const actions: BillingAction[] = [];
  const dueDay = reminderDays
    .filter((day) => day <= age && !invoice.sentReminderDays.includes(day))
    .at(-1);
  if (dueDay !== undefined && subscription.status !== "suspended") {
    actions.push({ kind: "send_reminder", invoiceId: invoice.invoiceId, day: dueDay });
  }
  if (subscription.status === "active" && age >= settings.dueAfterDays) {
    actions.push({ kind: "transition", event: "overdue" });
  }
  if (subscription.status === "past_due" && age >= settings.dueAfterDays + settings.graceDays) {
    actions.push({ kind: "transition", event: "grace_expired" });
  }
  return actions;
}

/** Decides what the daily 06:00 billing job must do for one subscription (BIL-03). */
export function planBillingDay(input: {
  subscription: BillingSubscription;
  openInvoice: OpenInvoice | undefined;
  today: string;
  settings: BillingSettings;
}): BillingAction[] {
  const { subscription, openInvoice, today, settings } = input;
  if (subscription.isDemo || subscription.status === "cancelled") return [];
  if (openInvoice === undefined) return planInvoice({ subscription, today, settings });
  return planCollection({ subscription, invoice: openInvoice, today, settings });
}
