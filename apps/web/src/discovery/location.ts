import { discoveryLocationInput, discoveryLocationOutput } from "@zaafran/contracts/discovery";
import { communeListOutput } from "@zaafran/contracts/merchant";
import type { Commune } from "../merchant/merchant-http";

type LocationInput = ReturnType<typeof discoveryLocationInput.parse>;
type Location = ReturnType<typeof discoveryLocationOutput.parse>;
const communeNames = communeListOutput.shape.communes.element.pick({ nameAr: true, nameFr: true });
type CommuneNames = ReturnType<typeof communeNames.parse>;
type LocationStorage = Pick<Storage, "getItem" | "setItem">;

export type PointInput = Extract<LocationInput, { kind: "point" }>;
export type LocationDraft = { input: LocationInput; accuracy: number | null };
export type SavedDiscoveryLocation = { location: Location; commune: CommuneNames | null };
const storageKey = "zaafran.discovery.location.v1";

function normalizeCommuneQuery(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\p{Mark}ـ]/gu, "")
    .toLowerCase()
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

export function filterCommunes(communes: readonly Commune[], query: string): readonly Commune[] {
  const words = normalizeCommuneQuery(query).split(" ");
  return communes.filter(({ code, nameAr, nameFr }) => {
    const terms = normalizeCommuneQuery(`${code} ${nameAr} ${nameFr}`);
    return words.every((word) => terms.includes(word));
  });
}

export function canConfirmLocation(draft: LocationDraft | null): draft is LocationDraft {
  return draft !== null && (draft.accuracy === null || draft.accuracy <= 40);
}

export async function readBrowserLocation(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined,
): Promise<{ input: PointInput; accuracy: number } | null> {
  if (!geolocation) return null;

  try {
    return await new Promise((resolve) => {
      geolocation.getCurrentPosition(
        ({ coords: { latitude, longitude, accuracy } }) => {
          const point = discoveryLocationInput.safeParse({ kind: "point", latitude, longitude });
          if (
            !point.success ||
            point.data.kind !== "point" ||
            !Number.isFinite(accuracy) ||
            accuracy < 0
          ) {
            resolve(null);
            return;
          }
          resolve({ input: point.data, accuracy });
        },
        () => {
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    });
  } catch {
    return null;
  }
}

export async function resolveLocation(
  input: LocationInput,
  signal: AbortSignal,
): Promise<Location | null> {
  try {
    const response = await fetch("/v1/geo/serviceability", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok) return null;
    const result = discoveryLocationOutput.safeParse(await response.json());
    if (!result.success) return null;
    if (input.kind === "commune" && result.data.communeId !== input.communeId) return null;
    return result.data;
  } catch {
    return null;
  }
}

export function readSavedLocation(storage: LocationStorage): SavedDiscoveryLocation | null {
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null) return null;
    const stored: unknown = JSON.parse(raw);
    if (
      !stored ||
      typeof stored !== "object" ||
      !("location" in stored) ||
      !("commune" in stored)
    ) {
      return null;
    }
    const location = discoveryLocationOutput.safeParse(stored.location);
    const commune = communeNames.nullable().safeParse(stored.commune);
    return location.success && commune.success
      ? { location: location.data, commune: commune.data }
      : null;
  } catch {
    return null;
  }
}

export function saveLocation(storage: LocationStorage, saved: SavedDiscoveryLocation): void {
  try {
    storage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    // The confirmed location remains in memory when storage is unavailable.
  }
}

/** Fired on `window` after the diner confirms a new delivery location. */
export const locationChangedEvent = "awid:location-changed";

/** The commune of the saved delivery location, which the feed needs for fees and distance. */
export function savedCommuneId(storage: LocationStorage): string | null {
  return readSavedLocation(storage)?.location.communeId ?? null;
}
