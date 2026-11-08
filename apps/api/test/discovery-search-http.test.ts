import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { DiscoverySearchServices } from "../src/discovery-search-routes.ts";

test("[CUS-05:http] accepts anonymous search and expands normalized spellings", async () => {
  const results = { restaurants: [], dishes: [] };
  const search = vi.fn<DiscoverySearchServices["search"]>().mockResolvedValue(results);
  const api = createApi({ checkReadiness: () => Promise.resolve(), discoverySearch: { search } });
  onTestFinished(() => api.close());
  const response = await api.inject("/v1/search?q=" + encodeURIComponent(" شَاوِرْمَا "));
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.json()).toEqual(results);
  expect(search).toHaveBeenCalledExactlyOnceWith({
    q: "شاورما",
    limit: 12,
    variants: ["shawarma", "chawarma", "chawerma"],
  });
  const invalid = await api.inject("/v1/search?q=pizza&longitude=3");
  expect(invalid.statusCode).toBe(400);
  expect(search).toHaveBeenCalledTimes(1);
});

test("[SRCH-05:http] reports a PostgreSQL statement timeout as retryable", async () => {
  const search = vi.fn<DiscoverySearchServices["search"]>().mockRejectedValue({ code: "57014" });
  const api = createApi({ checkReadiness: () => Promise.resolve(), discoverySearch: { search } });
  onTestFinished(() => api.close());
  const response = await api.inject("/v1/search?q=chawarma");
  expect(response.statusCode).toBe(503);
  expect(response.json()).toMatchObject({ code: "search_busy" });
});
