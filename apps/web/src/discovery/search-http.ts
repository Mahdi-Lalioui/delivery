import { publicSearchOutput } from "@zaafran/contracts/search";

export type SearchPage = ReturnType<typeof publicSearchOutput.parse>;

async function readDiscoverySearch(query: string, signal: AbortSignal): Promise<SearchPage | null> {
  const params = new URLSearchParams({ q: query, limit: "12" });
  try {
    const response = await fetch(`/v1/search?${params.toString()}`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) return null;
    const result = publicSearchOutput.safeParse(await response.json());
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function scheduleDiscoverySearch(
  query: string,
  onResult: (page: SearchPage | null) => void,
): () => void {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    void readDiscoverySearch(query, controller.signal).then((page) => {
      if (!controller.signal.aborted) onResult(page);
    });
  }, 150);
  return () => {
    clearTimeout(timeout);
    controller.abort();
  };
}
