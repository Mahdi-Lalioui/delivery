import type { FeedRestaurant } from "./feed-http";

export type PickupPin = {
  merchantId: string;
  slug: string;
  name: string;
  isOpen: boolean;
  latitude: number;
  longitude: number;
  /** A small webp of the logo, or null so the card shows the name's first letter. */
  logoUrl: string | null;
  rating: number | null;
  etaMinutes: { min: number; max: number } | null;
};

function logoUrl(merchantId: string, mediaId: string | null): string | null {
  if (mediaId === null) return null;
  return `/v1/merchants/${merchantId}/profile/photos/${mediaId}/variants/webp/160`;
}

/** Restaurants a diner can collect from that have a map pin, in feed order. */
export function pickupPins(restaurants: readonly FeedRestaurant[]): PickupPin[] {
  return restaurants.flatMap((restaurant) => {
    const { merchantId, slug, name, isOpen, offersPickup, pin } = restaurant;
    if (offersPickup !== true || pin === undefined) return [];
    return [
      {
        merchantId,
        slug,
        name,
        isOpen,
        ...pin,
        logoUrl: logoUrl(merchantId, restaurant.logoMediaId),
        rating: restaurant.rating ?? null,
        etaMinutes: restaurant.etaMinutes ?? null,
      },
    ];
  });
}

/** Where the map opens: the middle of the pins' bounding box, or null without pins. */
export function pinsCentre(
  pins: readonly PickupPin[],
): { latitude: number; longitude: number } | null {
  if (pins.length === 0) return null;
  const latitudes = pins.map((pin) => pin.latitude);
  const longitudes = pins.map((pin) => pin.longitude);
  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  };
}

/** The south-west and north-east corners around every pin, for fitting the map to them. */
export function pinsBounds(
  pins: readonly PickupPin[],
): [[number, number], [number, number]] | null {
  if (pins.length === 0) return null;
  const latitudes = pins.map((pin) => pin.latitude);
  const longitudes = pins.map((pin) => pin.longitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

/**
 * Groups on-screen pin positions so no two cards overlap: each pin joins the first group whose
 * first pin's card box (`size` pixels, centred above the point) it would collide with, else
 * starts its own. Returns indexes, in input order.
 */
export function groupPins(
  points: readonly { x: number; y: number }[],
  size: { width: number; height: number },
): number[][] {
  const groups: number[][] = [];
  points.forEach((point, index) => {
    const home = groups.find((group) => {
      const seed = points[group[0] ?? index] ?? point;
      return Math.abs(seed.x - point.x) < size.width && Math.abs(seed.y - point.y) < size.height;
    });
    if (home) home.push(index);
    else groups.push([index]);
  });
  return groups;
}
