import type { FeedRestaurant } from "./feed-http";

export type PickupPin = {
  merchantId: string;
  slug: string;
  name: string;
  isOpen: boolean;
  latitude: number;
  longitude: number;
};

/** Restaurants a diner can collect from that have a map pin, in feed order. */
export function pickupPins(restaurants: readonly FeedRestaurant[]): PickupPin[] {
  return restaurants.flatMap(({ merchantId, slug, name, isOpen, offersPickup, pin }) =>
    offersPickup === true && pin !== undefined ? [{ merchantId, slug, name, isOpen, ...pin }] : [],
  );
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
