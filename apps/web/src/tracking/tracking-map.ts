type Pin = { latitude: number; longitude: number };
type Box = { width: number; height: number; padding: number };

/**
 * Projects pins into an SVG box (equirectangular, scaled by cos(latitude), north up),
 * fitting all of them inside the padding. A single pin sits in the centre.
 */
export function projectPins(pins: readonly Pin[], box: Box): { x: number; y: number }[] {
  if (pins.length === 0) return [];
  const meanLatitude = pins.reduce((sum, pin) => sum + pin.latitude, 0) / pins.length;
  const scaleX = Math.cos((meanLatitude * Math.PI) / 180);
  const xs = pins.map((pin) => pin.longitude * scaleX);
  const ys = pins.map((pin) => pin.latitude);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const innerWidth = box.width - 2 * box.padding;
  const innerHeight = box.height - 2 * box.padding;
  const scale = Math.min(
    spanX === 0 ? Infinity : innerWidth / spanX,
    spanY === 0 ? Infinity : innerHeight / spanY,
  );
  if (!Number.isFinite(scale)) return pins.map(() => ({ x: box.width / 2, y: box.height / 2 }));
  const offsetX = (box.width - spanX * scale) / 2;
  const offsetY = (box.height - spanY * scale) / 2;
  return pins.map((_, index) => ({
    x: offsetX + ((xs[index] ?? minX) - minX) * scale,
    y: offsetY + (maxY - (ys[index] ?? maxY)) * scale,
  }));
}

type Point = { x: number; y: number };

/** Where to draw the destination, the courier (if it has a position) and the route line. */
export function layoutMap(
  input: { destination: Pin; courier: Pin | null; route: readonly Pin[] },
  box: Box,
): { destination: Point | undefined; courier: Point | undefined; route: Point[] } {
  const courierPins = input.courier === null ? [] : [input.courier];
  const points = projectPins([input.destination, ...courierPins, ...input.route], box);
  const destination = points[0];
  const courier = input.courier === null ? undefined : points[1];
  const route = points.slice(1 + courierPins.length);
  const fallback = courier !== undefined && destination !== undefined ? [courier, destination] : [];
  return { destination, courier, route: route.length > 1 ? route : fallback };
}
