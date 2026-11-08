import type { publicSearchOutput } from "@zaafran/contracts/search";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { DiscoverySearch } from "../src/discovery/search";
import { SearchContent } from "../src/discovery/search-content";
import { scheduleDiscoverySearch } from "../src/discovery/search-http";
import { addRecentSearch, readRecentSearches } from "../src/discovery/search-history";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const coverMediaId = "019d6abc-1234-7234-8234-123456789001";
const itemId = "019d6abc-1234-7234-8234-123456789002";
const page = {
  restaurants: [{ merchantId, slug: "jardins", name: "Les Jardins", coverMediaId }],
  dishes: [
    {
      itemId,
      merchantId,
      merchantSlug: "jardins",
      merchantName: "Les Jardins",
      names: { fr: "Sandwich grillé", ar: "شطيرة مشوية" },
      priceDzd: 450,
      photoMediaId: null,
    },
  ],
} satisfies ReturnType<typeof publicSearchOutput.parse>;

const noOp = () => undefined;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("[CUS-05] sends only the latest query after 150 ms and aborts superseded results", async () => {
  vi.useFakeTimers();
  const firstResponse = Promise.withResolvers<Response>();
  const fetchSearch = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(() => firstResponse.promise)
    .mockResolvedValueOnce(Response.json(page));
  vi.stubGlobal("fetch", fetchSearch);
  const onResult = vi.fn();

  const cancelBeforeFetch = scheduleDiscoverySearch("piz", onResult);
  await vi.advanceTimersByTimeAsync(149);
  expect(fetchSearch).not.toHaveBeenCalled();
  cancelBeforeFetch();

  const cancelInFlight = scheduleDiscoverySearch("pizza", onResult);
  await vi.advanceTimersByTimeAsync(150);
  const firstSignal = fetchSearch.mock.calls[0]?.[1]?.signal;
  expect(firstSignal?.aborted).toBe(false);
  cancelInFlight();
  expect(firstSignal?.aborted).toBe(true);

  scheduleDiscoverySearch("شاورما & grill", onResult);
  await vi.advanceTimersByTimeAsync(150);
  firstResponse.resolve(Response.json({ restaurants: [], dishes: [] }));
  await vi.advanceTimersByTimeAsync(0);

  const [url, init] = fetchSearch.mock.calls[1] ?? [];
  expect(url).toBe("/v1/search?q=%D8%B4%D8%A7%D9%88%D8%B1%D9%85%D8%A7+%26+grill&limit=12");
  expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store" });
  expect(fetchSearch).toHaveBeenCalledTimes(2);
  expect(onResult).toHaveBeenCalledExactlyOnceWith(page);
});

test("[CUS-05] exposes invalid responses as a recoverable search failure", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ dishes: [] })));
  const onResult = vi.fn();
  scheduleDiscoverySearch("pizza", onResult);
  await vi.advanceTimersByTimeAsync(150);
  expect(onResult).toHaveBeenCalledExactlyOnceWith(null);
});

test("[CUS-05] repairs malformed history and keeps ten distinct most recent entries", () => {
  const saved = readRecentSearches('["Pizza",true,"tacos"," PIZZA ","","شاورما"]');
  expect(saved).toEqual(["Pizza", "tacos", "شاورما"]);
  expect(readRecentSearches("{")).toEqual([]);
  expect(addRecentSearch(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], "  2  ")).toEqual([
    "2",
    "0",
    "1",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
  ]);
  expect(addRecentSearch(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], "fresh")).toEqual([
    "fresh",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
  ]);
});

test("[CUS-05] exposes a localized search trigger and groups bilingual results with real covers", () => {
  const trigger = renderToStaticMarkup(<DiscoverySearch locale="fr" />);
  expect(trigger).toContain('aria-haspopup="dialog"');
  expect(trigger).toContain("Rechercher un plat ou un restaurant");

  const html = renderToStaticMarkup(
    <SearchContent
      locale="ar"
      state={{ phase: "ready", page }}
      history={[]}
      onSelect={noOp}
      onClear={noOp}
      onRetry={noOp}
    />,
  );
  expect(html).toMatch(/<h3[^>]*>المطاعم<\/h3>/u);
  expect(html).toMatch(/<h3[^>]*>الأطباق<\/h3>/u);
  expect(html).toContain("<bdi>شطيرة مشوية</bdi>");
  expect(html).toContain("<bdi>450 دج</bdi>");
  expect(html).toContain(
    `/v1/merchants/${merchantId}/profile/photos/${coverMediaId}/variants/webp/320`,
  );
  expect(html).not.toContain("href=");
});

test("[CUS-05] distinguishes loading, failures and zero results and offers searchable suggestions", () => {
  const render = (state: Parameters<typeof SearchContent>[0]["state"]) =>
    renderToStaticMarkup(
      <SearchContent
        locale="en"
        state={state}
        history={[]}
        onSelect={noOp}
        onClear={noOp}
        onRetry={noOp}
      />,
    );

  expect(render({ phase: "loading" })).toContain("Searching…");
  expect(render({ phase: "error" })).toContain('role="alert"');
  expect(render({ phase: "error" })).toContain("Try again");
  const empty = render({ phase: "ready", page: { restaurants: [], dishes: [] } });
  expect(empty).toContain("No matching restaurants or dishes.");
  expect(empty).toMatch(/<button[^>]*><bdi>Shawarma<\/bdi><\/button>/u);
});

test("[CUS-05] shows local search history with a separate clear action", () => {
  const html = renderToStaticMarkup(
    <SearchContent
      locale="en"
      state={{ phase: "idle" }}
      history={["chawarma"]}
      onSelect={noOp}
      onClear={noOp}
      onRetry={noOp}
    />,
  );
  expect(html).toContain("Recent searches");
  expect(html).toMatch(/<button[^>]*><bdi>chawarma<\/bdi><\/button>/u);
  expect(html).toMatch(/<button[^>]*>Clear history<\/button>/u);
});
