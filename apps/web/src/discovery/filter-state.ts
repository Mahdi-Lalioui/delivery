import type { FeedFilters } from "./feed-http";

// CUS-04 / CUS-06: the feed filters that have real data in the published contract, their allowed
// values, and how they live in the URL (so a filtered list can be shared and survives reloads).

const allowed: Readonly<Record<string, readonly string[] | RegExp>> = {
  sort: ["distance", "rating", "eta", "fee"],
  openNow: ["true"],
  freeDelivery: ["true"],
  minRating: ["4"],
  maxEtaMinutes: ["20", "30", "45"],
  priceLevel: ["1", "2", "3"],
  acceptsBaridiPay: ["true"],
  acceptsTpe: ["true"],
  cuisine: /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
};

function isAllowed(key: string, value: string): boolean {
  const rule = allowed[key];
  if (rule === undefined) return false;
  return rule instanceof RegExp ? rule.test(value) : rule.includes(value);
}

export function filtersFromSearch(search: string): FeedFilters {
  const params = new URLSearchParams(search);
  return Object.fromEntries([...params].filter(([key, value]) => isAllowed(key, value)));
}

/** Replaces the filter parameters in `search`, keeping unrelated ones (such as `search`). */
export function filtersToSearch(search: string, filters: FeedFilters): string {
  const params = new URLSearchParams(search);
  for (const key of Object.keys(allowed)) params.delete(key);
  for (const [key, value] of Object.entries(filters)) params.set(key, value);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export type ActiveFilter = { key: string; value: string };

/** Filters shown as removable chips; the sort order is a choice, not a filter. */
export function activeFilters(filters: FeedFilters): ActiveFilter[] {
  return Object.entries(filters)
    .filter(([key]) => key !== "sort" && key !== "cuisine")
    .map(([key, value]) => ({ key, value }));
}
