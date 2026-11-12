import { describe, expect, it } from "vitest";
import { searchFromUrl, searchUrl } from "../src/discovery/search-url";

const home = "https://awid.test/ar/discover?cuisine=pizza";

describe("search in the address bar", () => {
  it("[CUS-05] opens search with its query and keeps the feed filters", () => {
    const url = searchUrl(home, { isOpen: true, query: "  شاورما " });
    expect(url).toBe(
      "https://awid.test/ar/discover?cuisine=pizza&search=open&q=%D8%B4%D8%A7%D9%88%D8%B1%D9%85%D8%A7",
    );
    expect(searchFromUrl(url)).toEqual({ isOpen: true, query: "شاورما" });
  });

  it("[CUS-05] closing search removes only the search parameters", () => {
    const open = searchUrl(home, { isOpen: true, query: "pizza" });
    expect(searchUrl(open, { isOpen: false })).toBe(home);
  });

  it("[CUS-05] leaves an empty query out of the address", () => {
    expect(searchUrl(home, { isOpen: true, query: "   " })).toBe(`${home}&search=open`);
  });

  it("[CUS-05] caps a pasted query at the search limit", () => {
    const long = `${home}&search=open&q=${"a".repeat(300)}`;
    expect(searchFromUrl(long).query).toHaveLength(100);
  });
});
