import { expect, test } from "vitest";
import { getIftarArrivalAt, getMaghribCountdownMs, resolveRamadanRange } from "../src/ramadan.ts";

const maghribAt = Date.parse("2027-02-08T18:23:00+01:00");

function offset(minutes: number): { kind: "maghrib"; minutes: number } {
  return { kind: "maghrib", minutes };
}

function clock(minuteOfDay: number): { kind: "clock"; minuteOfDay: number } {
  return { kind: "clock", minuteOfDay };
}

test("[HRS-03:domain] anchors merchant opening and closing offsets to the supplied Maghrib", () => {
  expect(resolveRamadanRange({ maghribAt, opens: offset(-60), closes: offset(90) })).toEqual({
    opensAt: Date.parse("2027-02-08T17:23:00+01:00"),
    closesAt: Date.parse("2027-02-08T19:53:00+01:00"),
  });
});

test("[HRS-03:domain] resolves a 02:00 closing after an evening opening", () => {
  expect(resolveRamadanRange({ maghribAt, opens: offset(-60), closes: clock(120) })).toEqual({
    opensAt: Date.parse("2027-02-08T17:23:00+01:00"),
    closesAt: Date.parse("2027-02-09T02:00:00+01:00"),
  });
});

test("[HRS-03:domain] resolves an absolute Algiers clock window for suhoor", () => {
  expect(resolveRamadanRange({ maghribAt, opens: clock(120), closes: clock(240) })).toEqual({
    opensAt: Date.parse("2027-02-08T02:00:00+01:00"),
    closesAt: Date.parse("2027-02-08T04:00:00+01:00"),
  });
});

test.each([
  { opens: offset(60), closes: offset(-60) },
  { opens: clock(120), closes: clock(120) },
  { opens: clock(-1), closes: offset(120) },
  { opens: offset(-60), closes: clock(1440) },
  { opens: offset(-60.5), closes: clock(120) },
  { opens: offset(-60), closes: offset(Number.POSITIVE_INFINITY) },
  { opens: offset(-60), closes: offset(Number.MAX_SAFE_INTEGER) },
])("[HRS-03:domain] rejects an invalid Ramadan range %j", ({ opens, closes }) => {
  expect(resolveRamadanRange({ maghribAt, opens, closes })).toBeNull();
});

test("[HRS-03:domain] targets Iftar five minutes before delivery-location Maghrib", () => {
  const deliveryMaghrib = Date.parse("2027-02-08T18:26:00+01:00");
  expect(getIftarArrivalAt(deliveryMaghrib)).toBe(Date.parse("2027-02-08T18:21:00+01:00"));
});

test("[HRS-03:domain] counts down to Maghrib and then stops at zero", () => {
  expect(getMaghribCountdownMs({ now: maghribAt - 61_000, maghribAt })).toBe(61_000);
  expect(getMaghribCountdownMs({ now: maghribAt, maghribAt })).toBe(0);
  expect(getMaghribCountdownMs({ now: maghribAt + 1, maghribAt })).toBe(0);
});

test("[HRS-03:domain] rejects an unusable Maghrib or clock instant", () => {
  expect(
    resolveRamadanRange({ maghribAt: Number.NaN, opens: clock(120), closes: clock(240) }),
  ).toBeNull();
  expect(getIftarArrivalAt(0)).toBeNull();
  expect(getIftarArrivalAt(Date.UTC(1982, 0, 1))).toBeNull();
  expect(getIftarArrivalAt(Number.POSITIVE_INFINITY)).toBeNull();
  expect(getMaghribCountdownMs({ now: -1, maghribAt })).toBeNull();
  expect(getMaghribCountdownMs({ now: maghribAt, maghribAt: 1.5 })).toBeNull();
});
