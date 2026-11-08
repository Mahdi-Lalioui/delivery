import { publicSearchQuery } from "@zaafran/contracts/search";

export const searchHistoryKey = "zaafran.discovery.search-history.v1";
const historyLimit = 10;

export function readRecentSearches(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const recent: string[] = [];
    const seen = new Set<string>();
    for (const value of parsed) {
      const query = publicSearchQuery.shape.q.safeParse(value);
      if (!query.success) continue;
      const normalized = query.data.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      recent.push(query.data);
      if (recent.length === historyLimit) break;
    }
    return recent;
  } catch {
    return [];
  }
}

export function addRecentSearch(history: readonly string[], query: string): string[] {
  const entry = query.trim();
  return [
    entry,
    ...history.filter((previous) => previous.toLowerCase() !== entry.toLowerCase()),
  ].slice(0, historyLimit);
}
