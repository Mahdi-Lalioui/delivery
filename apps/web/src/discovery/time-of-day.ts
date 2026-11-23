/**
 * Fanous (DESIGN §0): the night band and the featured collection follow the diner's clock.
 * Pure helpers; the caller reads the hour on the client after mount.
 */
export type Moment = "fajr" | "nhar" | "maghrib" | "lil";

/** The moment the server renders, before the client knows the diner's clock. */
export const serverMoment: Moment = "nhar";

export function momentAt(hour: number): Moment {
  if (hour >= 5 && hour < 9) return "fajr";
  if (hour >= 9 && hour < 17) return "nhar";
  if (hour >= 17 && hour < 20) return "maghrib";
  return "lil";
}

const featuredCuisines: Record<Moment, string> = {
  fajr: "pastry",
  nhar: "algerian",
  maghrib: "pastry",
  lil: "grill",
};

export function featuredCuisineFor(moment: Moment) {
  return featuredCuisines[moment];
}

/** Moves the collection that suits the moment to the front; the rest keep their order. */
export function featureFirst<T extends { cuisine: string }>(
  collections: readonly T[],
  moment: Moment,
) {
  const featured = featuredCuisineFor(moment);
  return [
    ...collections.filter(({ cuisine }) => cuisine === featured),
    ...collections.filter(({ cuisine }) => cuisine !== featured),
  ];
}
