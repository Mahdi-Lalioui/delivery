import { CalculationMethod, Coordinates as AdhanCoordinates, PrayerTimes } from "adhan";
import { isValidCoordinates } from "./coordinates.ts";
import type { Coordinates } from "./coordinates.ts";

type MaghribInput = {
  /** Calendar date in Africa/Algiers, formatted as YYYY-MM-DD. */
  readonly date: string;
  readonly coordinates: Coordinates;
  readonly method?: "Algeria" | keyof typeof CalculationMethod;
  readonly adjustmentMinutes?: number;
};

function toAdhanDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  // Adhan reads host-local calendar fields, then computes the prayer instant in UTC.
  const localNoon = new Date(year, month, day, 12);
  if (localNoon.getFullYear() !== year) return null;
  if (localNoon.getMonth() !== month || localNoon.getDate() !== day) return null;
  return localNoon;
}

function selectMethod(method: NonNullable<MaghribInput["method"]>) {
  if (method === "Algeria") {
    const parameters = CalculationMethod.MuslimWorldLeague();
    // CRAAG's published Algerian convention places Maghrib three minutes after sunset.
    parameters.adjustments.maghrib = 3;
    return parameters;
  }
  return Object.hasOwn(CalculationMethod, method) ? CalculationMethod[method]() : null;
}

/** Returns the Maghrib instant in epoch milliseconds, or null for unusable inputs. */
export function calculateMaghrib({
  date,
  coordinates,
  method = "Algeria",
  adjustmentMinutes = 0,
}: MaghribInput): number | null {
  if (!isValidCoordinates(coordinates) || !Number.isSafeInteger(adjustmentMinutes)) return null;
  const adhanDate = toAdhanDate(date);
  const parameters = selectMethod(method);
  if (!adhanDate || !parameters) return null;

  const location = new AdhanCoordinates(coordinates.latitude, coordinates.longitude);
  const prayers = new PrayerTimes(location, adhanDate, parameters);
  const adjusted = new Date(prayers.maghrib.getTime() + adjustmentMinutes * 60_000).getTime();
  return Number.isNaN(adjusted) ? null : adjusted;
}
