import { MercatorCoordinate, type CustomLayerInterface, type Map } from "maplibre-gl";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createScooterRenderer } from "./scooter-gl";

export type ScooterPose = { longitude: number; latitude: number; heading: number };

/** Colours come from the map container's DESIGN tokens so light and dark both match. */
function token(map: Map, name: string) {
  return getComputedStyle(map.getContainer()).getPropertyValue(name).trim();
}

const lightDirection = new Vector3(-40, -60, 120).normalize();

function shadePart(geometry: BufferGeometry, color: string) {
  const normals = geometry.getAttribute("normal");
  const normal = new Vector3();
  const paint = new Color(color);
  const shaded = new Color();
  const colors = new Float32BufferAttribute(normals.count * 3, 3);
  for (let index = 0; index < normals.count; index++) {
    normal.fromBufferAttribute(normals, index);
    const brightness = 0.55 + 0.45 * Math.max(0, normal.dot(lightDirection));
    shaded.copy(paint).multiplyScalar(brightness).convertLinearToSRGB();
    colors.setXYZ(index, shaded.r, shaded.g, shaded.b);
  }
  geometry.setAttribute("color", colors);
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  return geometry;
}

/** A procedural delivery scooter, 1 unit = 1 metre, nose along +Y, wheels on z = 0. */
function buildScooter(map: Map) {
  const body = token(map, "--color-primary");
  const dark = token(map, "--color-text");
  const light = token(map, "--color-surface");
  const cargo = token(map, "--color-harissa");
  const wheels = [-0.62, 0.62].map((y) =>
    shadePart(
      new TorusGeometry(0.26, 0.09, 10, 20).rotateY(Math.PI / 2).translate(0, y, 0.3),
      dark,
    ),
  );
  return mergeGeometries([
    ...wheels,
    shadePart(new BoxGeometry(0.42, 1.1, 0.16).translate(0, 0, 0.42), body),
    shadePart(new BoxGeometry(0.4, 0.55, 0.14).translate(0, -0.3, 0.86), dark),
    shadePart(new BoxGeometry(0.62, 0.55, 0.5).translate(0, -0.62, 1.22), cargo),
    shadePart(
      new CylinderGeometry(0.05, 0.05, 0.85).rotateX(Math.PI / 2 - 0.25).translate(0, 0.55, 0.85),
      light,
    ),
    shadePart(
      new CylinderGeometry(0.04, 0.04, 0.7).rotateZ(Math.PI / 2).translate(0, 0.66, 1.26),
      dark,
    ),
  ]);
}

/** The model is about 1.9 m long; it is drawn this many CSS pixels long at any zoom. */
const modelMeters = 1.9;
const targetPixels = 46;

/** How much to enlarge the life-size model so it stays legible; never smaller than life. */
export function scooterScale(zoom: number, latitude: number): number {
  const metersPerPixel =
    (40_075_016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
  return Math.max(1, (targetPixels * metersPerPixel) / modelMeters);
}

const glideMs = 850;

export function blend(from: ScooterPose, to: ScooterPose, progress: number): ScooterPose {
  const ease = 1 - (1 - progress) ** 3;
  const turn = ((((to.heading - from.heading) % 360) + 540) % 360) - 180;
  return {
    longitude: from.longitude + (to.longitude - from.longitude) * ease,
    latitude: from.latitude + (to.latitude - from.latitude) * ease,
    heading: from.heading + turn * ease,
  };
}

/** A MapLibre custom layer that draws the shaded 3D scooter in the shared view. */
export function scooterLayer(initial: ScooterPose) {
  let from = initial;
  let pose = initial;
  let startedAt = 0;
  let renderer: ReturnType<typeof createScooterRenderer>;
  let map: Map | undefined;
  const layer: CustomLayerInterface & { setPose: (next: ScooterPose) => void } = {
    id: "awid-scooter",
    type: "custom",
    renderingMode: "3d",
    onAdd(target, gl) {
      map = target;
      renderer = createScooterRenderer(gl, buildScooter(target));
    },
    onRemove() {
      renderer?.dispose();
      if (map) delete map.getContainer().dataset.scooter;
      renderer = undefined;
      map = undefined;
    },
    render(_gl, { defaultProjectionData }) {
      if (!renderer || !map) return;
      const progress = Math.min(1, (performance.now() - startedAt) / glideMs);
      const current = blend(from, pose, progress);
      if (progress < 1) map.triggerRepaint();
      const origin = MercatorCoordinate.fromLngLat([current.longitude, current.latitude], 0);
      const meters =
        origin.meterInMercatorCoordinateUnits() * scooterScale(map.getZoom(), current.latitude);
      const transform = new Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new Vector3(meters, -meters, meters))
        .multiply(new Matrix4().makeRotationZ((-current.heading * Math.PI) / 180));
      const projection = new Matrix4()
        .fromArray(defaultProjectionData.mainMatrix)
        .multiply(transform);
      const { dataset } = map.getContainer();
      if (renderer.draw(projection.elements) && dataset.scooter !== "true")
        dataset.scooter = "true";
    },
    setPose(next) {
      from = blend(from, pose, Math.min(1, (performance.now() - startedAt) / glideMs));
      pose = next;
      startedAt = performance.now();
      map?.triggerRepaint();
    },
  };
  return layer;
}
