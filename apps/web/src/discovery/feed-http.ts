import { publicFeedOutput, type publicRestaurantCard } from "@zaafran/contracts/feed";
import { savedCommuneId } from "./location";

type FeedPage = ReturnType<typeof publicFeedOutput.parse>;
export type FeedRestaurant = ReturnType<typeof publicRestaurantCard.parse>;

export interface FeedState extends FeedPage {
  phase: "loading" | "ready" | "error" | "retrying";
}

/** Feed query parameters as the API reads them (`true` flags, enum strings). */
export type FeedFilters = Readonly<Record<string, string>>;

function browserCommuneId(): string | null {
  try {
    return savedCommuneId(window.localStorage);
  } catch {
    return null;
  }
}

function feedUrl(cursor: string | null, filters: FeedFilters = {}): string {
  const params = new URLSearchParams(filters);
  const communeId = browserCommuneId();
  if (communeId !== null && !params.has("communeId")) params.set("communeId", communeId);
  if (cursor !== null) params.set("cursor", cursor);
  const query = params.toString();
  return query === "" ? "/v1/feed" : `/v1/feed?${query}`;
}

export async function readDiscoveryFeed(
  cursor: string | null,
  signal: AbortSignal,
  filters: FeedFilters = {},
): Promise<FeedPage | null> {
  const url = feedUrl(cursor, filters);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-cache",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) return null;
    const result = publicFeedOutput.safeParse(await response.json());
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
