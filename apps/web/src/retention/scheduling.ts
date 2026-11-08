import { getMaghribCountdownMs } from "@zaafran/domain/ramadan";
import {
  customerSlotsOutput,
  customerSlotsQuery,
  ramadanTodayOutput,
  ramadanTodayQuery,
} from "@zaafran/contracts/scheduling";

// CUS-13 / HRS-02 / HRS-03 slot loading and grouping, plus the Maghrib countdown.

type SlotsQuery = ReturnType<typeof customerSlotsQuery.parse>;
type SlotsOutput = ReturnType<typeof customerSlotsOutput.parse>;
export type Slot = SlotsOutput["slots"][number];
export type SlotsLoad = { kind: "ready"; slots: Slot[] } | { kind: "sign-in" | "error" };
export type SlotDay = { date: string; slots: Slot[] };

const algiersDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Algiers",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function loadSlots(query: SlotsQuery, signal?: AbortSignal): Promise<SlotsLoad> {
  const parsed = customerSlotsQuery.safeParse(query);
  if (!parsed.success) return { kind: "error" };
  const params = new URLSearchParams(Object.entries(parsed.data));
  try {
    const response = await fetch(`/v1/slots?${params.toString()}`, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      ...(signal && { signal }),
    });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (!response.ok) return { kind: "error" };
    const output = customerSlotsOutput.safeParse(await response.json());
    if (!output.success || output.data.fulfilment !== query.fulfilment) return { kind: "error" };
    return { kind: "ready", slots: output.data.slots };
  } catch {
    return { kind: "error" };
  }
}

/** Groups scheduled slots by Algiers calendar day; the Iftar slot is offered on its own. */
export function groupSlotsByDay(slots: readonly Slot[]): {
  iftar: Slot | undefined;
  days: SlotDay[];
} {
  const days = new Map<string, Slot[]>();
  let iftar: Slot | undefined;
  for (const slot of slots) {
    if (slot.kind === "iftar") {
      iftar ??= slot;
      continue;
    }
    const date = algiersDate.format(new Date(slot.scheduledFor));
    days.set(date, [...(days.get(date) ?? []), slot]);
  }
  return { iftar, days: [...days].map(([date, daySlots]) => ({ date, slots: daySlots })) };
}

/** HRS-03 countdown parts; zero after Maghrib, undefined for an invalid clock. */
export function countdownParts(input: { now: number; maghribAt: number }) {
  const remainingMs = getMaghribCountdownMs(input);
  if (remainingMs === null) return undefined;
  const totalSeconds = Math.floor(remainingMs / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export type RamadanToday =
  { kind: "ramadan"; maghribAt: string } | { kind: "not-ramadan" } | { kind: "error" };

/** HRS-03: today's Maghrib for the customer's commune while `ramadan_mode` is on. */
export async function loadRamadanToday(
  communeId: string,
  signal?: AbortSignal,
): Promise<RamadanToday> {
  const query = ramadanTodayQuery.safeParse({ communeId });
  if (!query.success) return { kind: "error" };
  try {
    const response = await fetch(
      `/v1/ramadan/today?${new URLSearchParams(query.data).toString()}`,
      {
        credentials: "same-origin",
        redirect: "error",
        ...(signal && { signal }),
      },
    );
    if (!response.ok) return { kind: "error" };
    const output = ramadanTodayOutput.safeParse(await response.json());
    if (!output.success) return { kind: "error" };
    return output.data.isRamadan
      ? { kind: "ramadan", maghribAt: output.data.maghribAt }
      : { kind: "not-ramadan" };
  } catch {
    return { kind: "error" };
  }
}
