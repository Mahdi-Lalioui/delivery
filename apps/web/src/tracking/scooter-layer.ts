import { MercatorCoordinate, type CustomLayerInterface, type Map } from "maplibre-gl";
import {
  BoxGeometry,
  Camera,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Scene,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";

export type ScooterPose = { longitude: number; latitude: number; heading: number };

/** Colours come from the map container's DESIGN tokens so light and dark both match. */
function token(map: Map, name: string) {
  return getComputedStyle(map.getContainer()).getPropertyValue(name).trim();
}

function part(geometry: BoxGeometry | CylinderGeometry | TorusGeometry, color: string) {
  return new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.55 }));
}

/** A procedural delivery scooter, 1 unit = 1 metre, nose along +Y, wheels on z = 0. */
function buildScooter(map: Map) {
  const body = token(map, "--color-primary");
  const dark = token(map, "--color-text");
  const light = token(map, "--color-surface");
  const cargo = token(map, "--color-harissa");
  const scooter = new Group();
  for (const y of [-0.62, 0.62]) {
    const wheel = part(new TorusGeometry(0.26, 0.09, 10, 20), dark);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, y, 0.3);
    scooter.add(wheel);
  }
  const deck = part(new BoxGeometry(0.42, 1.1, 0.16), body);
  deck.position.set(0, 0, 0.42);
  const seat = part(new BoxGeometry(0.4, 0.55, 0.14), dark);
  seat.position.set(0, -0.3, 0.86);
  const box = part(new BoxGeometry(0.62, 0.55, 0.5), cargo);
  box.position.set(0, -0.62, 1.22);
  const stem = part(new CylinderGeometry(0.05, 0.05, 0.85), light);
  stem.rotation.x = Math.PI / 2 - 0.25;
  stem.position.set(0, 0.55, 0.85);
  const bars = part(new CylinderGeometry(0.04, 0.04, 0.7), dark);
  bars.rotation.z = Math.PI / 2;
  bars.position.set(0, 0.66, 1.26);
  scooter.add(deck, seat, box, stem, bars);
  return scooter;
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

/** A MapLibre custom layer that renders the scooter with three.js and turns it with heading. */
export function scooterLayer(initial: ScooterPose) {
  let from = initial;
  let pose = initial;
  let startedAt = 0;
  let renderer: WebGLRenderer | undefined;
  let map: Map | undefined;
  const scene = new Scene();
  const camera = new Camera();
  const model = new Group();
  scene.add(model);
  const layer: CustomLayerInterface & { setPose: (next: ScooterPose) => void } = {
    id: "awid-scooter",
    type: "custom",
    renderingMode: "3d",
    onAdd(target, gl) {
      map = target;
      model.add(buildScooter(target));
      const sun = new DirectionalLight(0xffffff, 1.6);
      sun.position.set(-40, -60, 120);
      scene.add(new HemisphereLight(0xffffff, 0x8a8a8a, 1.4), sun);
      renderer = new WebGLRenderer({ canvas: target.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    onRemove() {
      renderer?.dispose();
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
      camera.projectionMatrix = new Matrix4()
        .fromArray(defaultProjectionData.mainMatrix)
        .multiply(transform);
      renderer.resetState();
      renderer.render(scene, camera);
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
