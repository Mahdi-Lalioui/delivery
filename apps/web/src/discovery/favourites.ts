const key = "awid:favourites";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type FavouriteStorage = Pick<Storage, "getItem" | "setItem">;

function parseIds(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && uuid.test(value));
  } catch {
    return [];
  }
}

/** Favourite restaurant IDs saved on this device; malformed entries are dropped. */
export function readFavourites(storage: FavouriteStorage): Set<string> {
  return new Set(parseIds(storage.getItem(key)));
}

/** Flips one restaurant and returns whether it is now a favourite. */
export function toggleFavourite(storage: FavouriteStorage, merchantId: string): boolean {
  const favourites = readFavourites(storage);
  const isFavourite = !favourites.delete(merchantId);
  if (isFavourite) favourites.add(merchantId);
  storage.setItem(key, JSON.stringify([...favourites]));
  return isFavourite;
}
