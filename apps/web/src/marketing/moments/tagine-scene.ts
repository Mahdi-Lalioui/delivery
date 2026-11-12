import {
  AmbientLight,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector2,
  WebGLRenderer,
} from "three";

/** Scene timeline, in milliseconds from the start. */
export const tagineTimeline = { lidUp: 900, steamEnd: 2300, fadeOut: 2700 } as const;

/** The lid's lift (in model units) and tilt (radians) at `ms`: a damped spring up and over. */
export function lidPose(ms: number): { lift: number; tilt: number } {
  const t = Math.min(1, Math.max(0, ms / tagineTimeline.lidUp));
  const spring = 1 - Math.exp(-6 * t) * Math.cos(9 * t);
  return { lift: 0.9 * spring, tilt: -0.45 * spring };
}

/** One steam puff's rise (0–1) and opacity at `ms`; puffs start staggered after the lid moves. */
export function steamPuff(ms: number, index: number): { rise: number; opacity: number } {
  const start = 350 + index * 120;
  const life = 1300;
  const t = (ms - start) / life;
  if (t <= 0 || t >= 1) return { rise: t >= 1 ? 1 : 0, opacity: 0 };
  return { rise: t, opacity: Math.sin(Math.PI * t) * 0.35 };
}

type Colours = { clay: string; glaze: string; saffron: string; couscous: string; steam: string };

function lathe(points: readonly [number, number][], color: string) {
  const geometry = new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    48,
  );
  return new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.6 }));
}

function buildTagine(colours: Colours) {
  const base = lathe(
    [
      [0, 0],
      [1.25, 0],
      [1.5, 0.12],
      [1.55, 0.3],
      [1.2, 0.34],
      [0, 0.34],
    ],
    colours.clay,
  );
  const lid = new Group();
  const cone = lathe(
    [
      [1.18, 0],
      [1.05, 0.25],
      [0.6, 0.9],
      [0.28, 1.45],
      [0.16, 1.7],
      [0, 1.72],
    ],
    colours.glaze,
  );
  const knob = new Mesh(
    new SphereGeometry(0.17, 20, 16),
    new MeshStandardMaterial({ color: colours.saffron, roughness: 0.4 }),
  );
  knob.position.y = 1.82;
  const band = new Mesh(
    new CylinderGeometry(1.14, 1.17, 0.08, 48),
    new MeshStandardMaterial({ color: colours.saffron, roughness: 0.5 }),
  );
  band.position.y = 0.1;
  lid.add(cone, knob, band);
  lid.position.set(0, 0.34, 0);
  return { base, lid };
}

/** What the lid reveals: a golden mound with vegetables, built from spheres. */
function buildDish(colours: Colours) {
  const dish = new Group();
  const mound = new Mesh(
    new SphereGeometry(0.95, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new MeshStandardMaterial({ color: colours.couscous, roughness: 0.9 }),
  );
  mound.scale.set(1, 0.55, 1);
  dish.add(mound);
  const pieces = [
    [0.35, 0.42, 0.1, colours.clay],
    [-0.3, 0.4, 0.25, colours.clay],
    [0.05, 0.5, -0.3, colours.glaze],
    [-0.15, 0.48, -0.05, colours.clay],
    [0.45, 0.3, -0.35, colours.glaze],
  ] as const;
  for (const [x, y, z, color] of pieces) {
    const piece = new Mesh(
      new SphereGeometry(0.16, 14, 10),
      new MeshStandardMaterial({ color, roughness: 0.55 }),
    );
    piece.position.set(x, y, z);
    dish.add(piece);
  }
  dish.position.y = 0.3;
  return dish;
}

function buildSteam(colour: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const puff = new Mesh(
      new SphereGeometry(0.12 + (index % 3) * 0.04, 14, 10),
      new MeshStandardMaterial({
        color: colour,
        emissive: colour,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        roughness: 1,
      }),
    );
    const angle = (index / count) * Math.PI * 2;
    puff.userData = { x: Math.cos(angle) * 0.45, z: Math.sin(angle) * 0.45 };
    return puff;
  });
}

/**
 * Draws the order-confirmed tagine on `canvas`: the lid springs up and tips back, saffron steam
 * rises, then `onDone` runs. Returns a stop function that frees the GPU resources.
 */
export function playTagine(canvas: HTMLCanvasElement, colours: Colours, onDone: () => void) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
  camera.position.set(0, 3.4, 6.2);
  camera.lookAt(0, 0.9, 0);
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 6, 4);
  scene.add(new AmbientLight(0xffffff, 0.9), sun);
  const { base, lid } = buildTagine(colours);
  const steam = buildSteam(colours.steam, 9);
  const dish = buildDish(colours);
  scene.add(base, dish, lid, ...steam);

  const startedAt = performance.now();
  let frame = 0;
  let isDone = false;
  const finish = () => {
    if (isDone) return;
    isDone = true;
    onDone();
  };
  const draw = (now: number) => {
    const ms = now - startedAt;
    const { lift, tilt } = lidPose(ms);
    lid.position.y = 0.34 + lift;
    lid.rotation.x = tilt;
    steam.forEach((puff, index) => {
      const { rise, opacity } = steamPuff(ms, index);
      const { x, z } = puff.userData;
      puff.position.set(Number(x) * (1 + rise), 0.6 + rise * 2.6, Number(z) * (1 + rise));
      puff.scale.setScalar(1 + rise * 1.8);
      const material = puff.material;
      if (material instanceof MeshStandardMaterial) material.opacity = opacity;
    });
    base.rotation.y = ms / 4000;
    dish.rotation.y = ms / 4000;
    lid.rotation.y = ms / 4000;
    renderer.render(scene, camera);
    if (ms < tagineTimeline.fadeOut) {
      frame = window.requestAnimationFrame(draw);
      return;
    }
    finish();
  };
  frame = window.requestAnimationFrame(draw);
  // Frames pause in background tabs; the diner must still reach tracking on time.
  const guard = window.setTimeout(finish, tagineTimeline.fadeOut + 400);

  return () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(guard);
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (object.geometry instanceof BufferGeometry) object.geometry.dispose();
      if (object.material instanceof MeshStandardMaterial) object.material.dispose();
    });
    renderer.dispose();
  };
}
