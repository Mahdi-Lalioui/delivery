import { merchantRamadanInput } from "@zaafran/contracts/merchant-hours";
import { expect, test } from "vitest";
import { calculateMaghrib } from "../src/maghrib.ts";
import reference from "./fixtures/algiers-maghrib-2027.json" with { type: "json" };

const contractMethods = merchantRamadanInput.shape.method.options;
const date = "2027-02-15";
const minuteMs = 60_000;

test("[MER-16:method] the contract offers every calculation method except Other", () => {
  expect(contractMethods).toContain("Algeria");
  expect(contractMethods).not.toContain("Other");
});

test.each(contractMethods)("[MER-16:method] %s yields a Maghrib time near sunset", (method) => {
  const algeria = calculateMaghrib({ date, coordinates: reference.coordinates });
  const actual = calculateMaghrib({ date, coordinates: reference.coordinates, method });
  if (algeria === null || actual === null) throw new Error(`${method} gave no Maghrib`);
  // Methods differ only in small Maghrib adjustments; Tehran's 4° angle is the furthest.
  expect(Math.abs(actual - algeria)).toBeLessThanOrEqual(20 * minuteMs);
});
