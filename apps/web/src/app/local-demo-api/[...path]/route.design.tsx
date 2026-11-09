import { customerFavouritesOutput } from "@zaafran/contracts/retention";
import { getResponse } from "msw";
import { analyticsHandlers, analyticsMerchantId } from "../../../../test/mocks/analytics-handlers";
import {
  orderMockIds,
  ordersHandlers,
  ordersMockState,
} from "../../../../test/mocks/orders-handlers";
import { ratingMockIds, ratingsHandlers } from "../../../../test/mocks/ratings-handlers";

const handlers = [
  ...ordersHandlers(ordersMockState()),
  ...ratingsHandlers(),
  ...analyticsHandlers(),
];

function fixtureUrl(request: Request, segments: string[]): URL {
  const url = new URL(request.url);
  const path = [...segments];
  if (path[0] === "merchants") {
    path[1] = path[2] === "analytics" ? analyticsMerchantId : ratingMockIds.merchantId;
  }
  url.pathname = `/v1/${path.join("/")}`;
  return url;
}

const featured = {
  slug: "tour-demo-lune-de-semoule",
  name: "Lune de Semoule · قمر السميد",
};

async function fixtureResponse(response: Response, url: URL): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  if (url.pathname === "/v1/me/favourites" && response.ok) {
    headers.delete("Content-Length");
    const data = customerFavouritesOutput.parse(await response.json());
    const restaurants = data.restaurants.map((row) =>
      row.merchantId === orderMockIds.merchantId ? { ...row, ...featured } : row,
    );
    return Response.json({ restaurants }, { headers });
  }
  return new Response(response.body, { status: response.status, headers });
}

async function serveFixtures(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (process.env.NODE_ENV !== "development" || process.env.ZAAFRAN_LOCAL_DEMO !== "1")
    return new Response(null, { status: 404 });
  const { path } = await params;
  const url = fixtureUrl(request, path);
  const body = request.body === null ? null : await request.text();
  const fixture = await getResponse(
    handlers,
    new Request(url, { method: request.method, headers: request.headers, body }),
  );
  return fixture ? fixtureResponse(fixture, url) : new Response(null, { status: 404 });
}

export const GET = serveFixtures;
export const POST = serveFixtures;
export const PUT = serveFixtures;
export const DELETE = serveFixtures;
