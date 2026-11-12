/** The page address with search shown (and its query) or hidden; other parameters are kept. */
export function searchUrl(href: string, search: { isOpen: boolean; query?: string }): string {
  const url = new URL(href);
  url.searchParams.delete("search");
  url.searchParams.delete("q");
  if (search.isOpen) {
    url.searchParams.set("search", "open");
    const query = search.query?.trim() ?? "";
    if (query !== "") url.searchParams.set("q", query);
  }
  return url.toString();
}

/** The search state an address asks for: open or not, and the query to start with. */
export function searchFromUrl(href: string): { isOpen: boolean; query: string } {
  const url = new URL(href);
  return {
    isOpen: url.searchParams.get("search") === "open",
    query: (url.searchParams.get("q") ?? "").slice(0, 100),
  };
}
