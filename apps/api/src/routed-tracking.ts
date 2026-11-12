import type { createOrderRepository } from "@zaafran/db/orders";
import { estimateDelivery, isTrackingEtaDue } from "@zaafran/domain/eta";
import type { createRoadRouter } from "@zaafran/geo/road-routing";

type ReadTracking = ReturnType<typeof createOrderRepository>["tracking"];
type Tracking = NonNullable<Awaited<ReturnType<ReadTracking>>>;
type Delivery = Extract<Tracking, { fulfilment: "delivery" }>;
type Position = NonNullable<NonNullable<Delivery["courier"]>["position"]>;
type Route = ReturnType<typeof createRoadRouter>;
type Estimate = { route: Delivery["route"]; eta: Delivery["order"]["eta"] };
type EstimateContext = { position: Position; destination: Delivery["destination"]; at: number };

async function estimateRoute(
  route: Route,
  { position, destination, at }: EstimateContext,
): Promise<Estimate> {
  const result = await route(position, destination);
  const eta = estimateDelivery({ prepMinutes: 0, travelMinutes: result.durationSeconds / 60 });
  if (!eta.ok || eta.value.latestMinutes > 24 * 60) return { route: result.points, eta: null };
  return {
    route: result.points,
    eta: {
      earliestAt: new Date(at + eta.value.earliestMinutes * 60_000).toISOString(),
      latestAt: new Date(at + eta.value.latestMinutes * 60_000).toISOString(),
    },
  };
}

export function createRoutedTracking({
  read,
  route,
  now = Date.now,
}: {
  read: ReadTracking;
  route: Route;
  now?: () => number;
}): ReadTracking {
  const cache = new Map<string, { at: number; value: Promise<Estimate> }>();
  const limit = 512;

  function currentEstimate(orderId: string, context: EstimateContext) {
    const prior = cache.get(orderId);
    if (prior && !isTrackingEtaDue({ now: context.at, lastComputedAt: prior.at }))
      return prior.value;
    cache.delete(orderId);
    if (cache.size >= limit) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    const value = estimateRoute(route, context).catch(() => ({ route: null, eta: null }));
    cache.set(orderId, { at: context.at, value });
    return value;
  }

  return async (request) => {
    const view = await read(request);
    if (view?.fulfilment !== "delivery" || view.order.status !== "out_for_delivery") return view;
    const { destination, courier } = view;
    const position = courier?.position;
    const at = now();
    const estimate =
      position && Date.parse(position.capturedAt) >= at - 120_000
        ? await currentEstimate(view.order.orderId, { position, destination, at })
        : { route: null, eta: null };
    return { ...view, route: estimate.route, order: { ...view.order, eta: estimate.eta } };
  };
}
