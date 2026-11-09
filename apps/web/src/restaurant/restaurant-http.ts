import {
  publicRestaurantOutput,
  publicRestaurantItemsOutput,
  publicRestaurantItemOutput,
} from "@zaafran/contracts/restaurant";

type ReadResult<Value> = { kind: "ready"; value: Value } | { kind: "stale" } | { kind: "error" };

async function readPublic<Value>(
  path: string,
  schema: { safeParse(value: unknown): { success: true; data: Value } | { success: false } },
  { signal, fetcher }: { signal: AbortSignal; fetcher: typeof fetch },
): Promise<ReadResult<Value>> {
  try {
    const response = await fetcher(path, {
      credentials: "omit",
      cache: "no-cache",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (response.status === 409) return { kind: "stale" };
    if (!response.ok) return { kind: "error" };
    const result = schema.safeParse(await response.json());
    return result.success ? { kind: "ready", value: result.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function readRestaurant(slug: string, signal: AbortSignal, fetcher = fetch) {
  const result = await readPublic(
    "/v1/merchants/" + encodeURIComponent(slug),
    publicRestaurantOutput,
    {
      signal,
      fetcher,
    },
  );
  return result.kind === "ready" ? result.value : null;
}

export function readRestaurantItems(
  input: { slug: string; categoryId: string; cursor?: string },
  signal: AbortSignal,
  fetcher = fetch,
) {
  const path = `/v1/merchants/${encodeURIComponent(input.slug)}/categories/${input.categoryId}/items`;
  const query = new URLSearchParams({ limit: "24" });
  if (input.cursor) query.set("cursor", input.cursor);
  return readPublic(path + "?" + query.toString(), publicRestaurantItemsOutput, {
    signal,
    fetcher,
  });
}

export function readRestaurantItem(
  input: { slug: string; itemId: string; expectedRevision: number },
  signal: AbortSignal,
  fetcher = fetch,
) {
  const path = `/v1/merchants/${encodeURIComponent(input.slug)}/items/${input.itemId}`;
  const query = new URLSearchParams({ expectedRevision: String(input.expectedRevision) });
  return readPublic(path + "?" + query.toString(), publicRestaurantItemOutput, { signal, fetcher });
}
