import { publicFeedOutput, type publicRestaurantCard } from "@zaafran/contracts/feed";

type FeedPage = ReturnType<typeof publicFeedOutput.parse>;
export type FeedRestaurant = ReturnType<typeof publicRestaurantCard.parse>;

export interface FeedState extends FeedPage {
  phase: "loading" | "ready" | "error" | "retrying";
}

export async function readDiscoveryFeed(
  cursor: string | null,
  signal: AbortSignal,
): Promise<FeedPage | null> {
  const url = cursor === null ? "/v1/feed" : `/v1/feed?cursor=${encodeURIComponent(cursor)}`;
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
