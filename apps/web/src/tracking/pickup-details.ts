interface Point {
  readonly latitude: number;
  readonly longitude: number;
}

/** When a pickup order was marked ready, so the screen says "ready since", not "ready by". */
export function readySince(
  timeline: readonly { readonly status: string; readonly at: string }[],
): string | undefined {
  return timeline.find(({ status }) => status === "ready")?.at;
}

/** Directions to the restaurant, from wherever the diner is, in OpenStreetMap. */
export function directionsUrl({ latitude, longitude }: Point): string {
  const url = new URL("https://www.openstreetmap.org/directions");
  url.searchParams.set("route", `;${String(latitude)},${String(longitude)}`);
  return url.toString();
}
