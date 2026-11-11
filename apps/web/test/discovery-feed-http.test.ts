import { afterEach, expect, test, vi } from "vitest";
import { readDiscoveryFeed } from "../src/discovery/feed-http";

const cursor = "019d6abc-1234-7234-8234-123456789000";
const emptyPage = { restaurants: [], nextCursor: null };

afterEach(() => vi.unstubAllGlobals());

test("[CUS-01] requests the public feed without a session or cached response", async () => {
  const fetchFeed = vi.fn<typeof fetch>().mockResolvedValue(Response.json(emptyPage));
  vi.stubGlobal("fetch", fetchFeed);

  await expect(readDiscoveryFeed(null, new AbortController().signal)).resolves.toEqual(emptyPage);
  const [path, options] = fetchFeed.mock.calls[0] ?? [];
  expect(path).toBe("/v1/feed");
  expect(options).toMatchObject({
    method: "GET",
    credentials: "omit",
    cache: "no-cache",
    redirect: "error",
  });
  expect(options?.signal).toBeInstanceOf(AbortSignal);
});

test("[CUS-03] sends the cursor for the next feed page", async () => {
  const fetchFeed = vi.fn().mockResolvedValue(Response.json(emptyPage));
  vi.stubGlobal("fetch", fetchFeed);

  await expect(readDiscoveryFeed(cursor, new AbortController().signal)).resolves.toEqual(emptyPage);
  expect(fetchFeed.mock.calls[0]?.[0]).toBe(`/v1/feed?cursor=${cursor}`);
});

test.each([
  ["a malformed response", () => Response.json({ restaurants: [], nextCursor: "invalid" })],
  ["an unavailable feed", () => new Response(null, { status: 503 })],
  ["a non-JSON response", () => new Response("<!doctype html>")],
])("[CUS-01] handles %s as a retryable error", async (_failure, response) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));

  await expect(readDiscoveryFeed(null, new AbortController().signal)).resolves.toBeNull();
});
