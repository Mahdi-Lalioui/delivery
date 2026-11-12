import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatApproxDistance } from "../src/discovery/distance-format";
import { FeedMeta } from "../src/discovery/feed-card";
import { readDiscoveryFeed } from "../src/discovery/feed-http";
import { saveLocation } from "../src/discovery/location";

const communeId = "4b0b7c4e-3a43-4a8e-9a43-1d1f3b7e0c11";

describe("approximate distance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[CUS-04] rounds the commune-centre distance to what it is worth", () => {
    expect(formatApproxDistance(40, "en")).toBe("100 m");
    expect(formatApproxDistance(760, "en")).toBe("800 m");
    expect(formatApproxDistance(1240, "en")).toBe("1.2 km");
    expect(formatApproxDistance(12_600, "en")).toBe("13 km");
    expect(formatApproxDistance(1240, "ar")).toMatch(/1[.,٫]2/u);
  });

  it("[CUS-04] shows the distance on a card only when the feed sends it", () => {
    const withDistance = renderToStaticMarkup(
      <FeedMeta restaurant={{ distanceMeters: 1240 }} locale="fr" />,
    );
    expect(withDistance).toContain("Distance approximative");
    expect(withDistance).toMatch(/~1,2\s?km/u);
    const without = renderToStaticMarkup(
      <FeedMeta restaurant={{ rating: 4.5, ratingCount: 3 }} locale="fr" />,
    );
    expect(without).not.toContain("Distance approximative");
  });

  it("[CUS-04] asks the feed for the saved commune so fees and distance fit it", async () => {
    const items = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
    };
    vi.stubGlobal("window", { localStorage });
    saveLocation(localStorage, {
      location: { latitude: 36.75, longitude: 3.05, communeId, serviceAreaId: null },
      commune: null,
    });
    const fetchMock = vi.fn((url: string) => {
      expect(url).toContain(`communeId=${communeId}`);
      return Promise.resolve(Response.json({ restaurants: [], nextCursor: null }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await readDiscoveryFeed(null, new AbortController().signal, { sort: "fee" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
