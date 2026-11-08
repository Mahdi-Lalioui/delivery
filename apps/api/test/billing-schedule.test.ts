import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  addCalendarMonth,
  daysBetween,
  formatInvoiceNumber,
  planBillingDay,
  transitionSubscription,
  type BillingSettings,
  type OpenInvoice,
} from "../src/billing-schedule.ts";

const settings: BillingSettings = { priceDzd: 5000, trialDays: 30, dueAfterDays: 7, graceDays: 7 };
const subscriptionId = "01932f18-3150-7c33-8a7a-53acfd343101";

function invoice(issuedOn: string, sentReminderDays: readonly number[] = []): OpenInvoice {
  return { invoiceId: "inv-1", issuedOn, sentReminderDays };
}

describe("calendar helpers", () => {
  it("[BIL-03] adds days and months on calendar dates without timezone drift", () => {
    expect(addCalendarDays("2027-02-27", 2)).toBe("2027-03-01");
    expect(addCalendarMonth("2027-01-31")).toBe("2027-02-28");
    expect(addCalendarMonth("2028-01-31")).toBe("2028-02-29");
    expect(addCalendarMonth("2027-12-15")).toBe("2028-01-15");
    expect(daysBetween("2027-01-01", "2027-01-15")).toBe(14);
  });
});

describe("formatInvoiceNumber", () => {
  it("[BIL-04] pads the yearly sequence to six digits", () => {
    expect(formatInvoiceNumber(2027, 123)).toBe("2027-000123");
    expect(formatInvoiceNumber(2027, 1)).toBe("2027-000001");
  });

  it("[BIL-04] rejects sequences that cannot be represented", () => {
    expect(() => formatInvoiceNumber(2027, 0)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2027, 1_000_000)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2027, 1.5)).toThrow(RangeError);
  });
});

describe("transitionSubscription", () => {
  it("[BIL-02] follows trialing → active → past_due → suspended → active", () => {
    expect(transitionSubscription("trialing", "period_started")).toEqual({
      ok: true,
      value: "active",
    });
    expect(transitionSubscription("active", "overdue")).toEqual({ ok: true, value: "past_due" });
    expect(transitionSubscription("past_due", "grace_expired")).toEqual({
      ok: true,
      value: "suspended",
    });
    expect(transitionSubscription("suspended", "payment_recorded")).toEqual({
      ok: true,
      value: "active",
    });
    expect(transitionSubscription("past_due", "payment_recorded")).toEqual({
      ok: true,
      value: "active",
    });
  });

  it("[BIL-02] allows cancellation on request and nothing after it", () => {
    expect(transitionSubscription("suspended", "cancel_requested")).toEqual({
      ok: true,
      value: "cancelled",
    });
    expect(transitionSubscription("cancelled", "payment_recorded").ok).toBe(false);
    expect(transitionSubscription("cancelled", "cancel_requested").ok).toBe(false);
  });

  it("[BIL-02] rejects illegal jumps", () => {
    expect(transitionSubscription("trialing", "grace_expired")).toEqual({
      ok: false,
      error: { code: "illegal_subscription_transition" },
    });
    expect(transitionSubscription("active", "grace_expired").ok).toBe(false);
    expect(transitionSubscription("suspended", "overdue").ok).toBe(false);
  });
});

describe("planBillingDay", () => {
  const trialing = {
    subscriptionId,
    status: "trialing" as const,
    trialStartedOn: "2027-01-01",
    nextPeriodStart: "2027-01-31",
    isDemo: false,
  };

  it("[BIL-03] does nothing during the trial", () => {
    expect(
      planBillingDay({
        subscription: trialing,
        openInvoice: undefined,
        today: "2027-01-30",
        settings,
      }),
    ).toEqual([]);
  });

  it("[BIL-03] issues one invoice at period start with an idempotency key per period", () => {
    const actions = planBillingDay({
      subscription: trialing,
      openInvoice: undefined,
      today: "2027-01-31",
      settings,
    });
    expect(actions).toEqual([
      {
        kind: "issue_invoice",
        idempotencyKey: `${subscriptionId}:2027-01-31`,
        periodStart: "2027-01-31",
        periodEnd: "2027-02-28",
        amountDzd: 5000,
        dueOn: "2027-02-07",
      },
      { kind: "transition", event: "period_started" },
    ]);
  });

  it("[BIL-03] catches up a missed period start without issuing twice", () => {
    const actions = planBillingDay({
      subscription: trialing,
      openInvoice: undefined,
      today: "2027-02-02",
      settings,
    });
    expect(actions.filter((action) => action.kind === "issue_invoice")).toHaveLength(1);
  });

  it("[BIL-06] never invoices demo or test merchants", () => {
    const demo = { ...trialing, isDemo: true };
    expect(
      planBillingDay({ subscription: demo, openInvoice: undefined, today: "2027-02-10", settings }),
    ).toEqual([]);
  });

  it("[BIL-03] sends reminders on days 0, 5, 7 and 12 once each", () => {
    const active = { ...trialing, status: "active" as const, nextPeriodStart: "2027-02-28" };
    const reminderOn = (today: string, sent: readonly number[] = []) =>
      planBillingDay({
        subscription: active,
        openInvoice: invoice("2027-01-31", sent),
        today,
        settings,
      });
    expect(reminderOn("2027-01-31")).toContainEqual({
      kind: "send_reminder",
      invoiceId: "inv-1",
      day: 0,
    });
    expect(reminderOn("2027-02-05")).toContainEqual({
      kind: "send_reminder",
      invoiceId: "inv-1",
      day: 5,
    });
    expect(reminderOn("2027-02-05", [0, 5])).not.toContainEqual(
      expect.objectContaining({ kind: "send_reminder" }),
    );
    expect(reminderOn("2027-02-03", [0])).not.toContainEqual(
      expect.objectContaining({ kind: "send_reminder" }),
    );
  });

  it("[BIL-03] marks the subscription past due at day 7 and suspends at day 14", () => {
    const active = { ...trialing, status: "active" as const, nextPeriodStart: "2027-02-28" };
    expect(
      planBillingDay({
        subscription: active,
        openInvoice: invoice("2027-01-31", [0, 5]),
        today: "2027-02-07",
        settings,
      }),
    ).toEqual([
      { kind: "send_reminder", invoiceId: "inv-1", day: 7 },
      { kind: "transition", event: "overdue" },
    ]);
    const pastDue = { ...active, status: "past_due" as const };
    expect(
      planBillingDay({
        subscription: pastDue,
        openInvoice: invoice("2027-01-31", [0, 5, 7, 12]),
        today: "2027-02-14",
        settings,
      }),
    ).toEqual([{ kind: "transition", event: "grace_expired" }]);
  });

  it("[BIL-03] does not issue a new period invoice while one is still open", () => {
    const suspended = { ...trialing, status: "suspended" as const, nextPeriodStart: "2027-02-28" };
    const actions = planBillingDay({
      subscription: suspended,
      openInvoice: invoice("2027-01-31", [0, 5, 7, 12]),
      today: "2027-03-01",
      settings,
    });
    expect(actions).toEqual([]);
  });

  it("[BIL-02] leaves cancelled subscriptions alone", () => {
    const cancelled = { ...trialing, status: "cancelled" as const };
    expect(
      planBillingDay({
        subscription: cancelled,
        openInvoice: undefined,
        today: "2027-03-01",
        settings,
      }),
    ).toEqual([]);
  });
});
