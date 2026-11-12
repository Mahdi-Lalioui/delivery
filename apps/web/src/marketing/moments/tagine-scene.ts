import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  WebGLRenderer,
  BufferGeometry,
  MeshStandardMaterial,
  type Texture,
} from "three";
import { buildDish, buildTagine, type TagineColours } from "./tagine-model";

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
  return { rise: t, opacity: Math.sin(Math.PI * t) * 0.55 };
}

const puffCount = 9;

function rgb(colour: string): string {
  const { r, g, b } = new Color(colour);
  return [r, g, b].map((channel) => String(Math.round(channel * 255))).join(", ");
}

/** A soft round puff: a radial gradient that fades to nothing, so sprites read as vapour. */
function steamTexture(colour: string, mist: string): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    const channels = rgb(colour);
    const edge = rgb(mist);
    gradient.addColorStop(0, `rgba(${channels}, 0.95)`);
    gradient.addColorStop(0.5, `rgba(${channels}, 0.55)`);
    gradient.addColorStop(0.78, `rgba(${edge}, 0.14)`);
    gradient.addColorStop(1, `rgba(${edge}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function buildSteam(texture: Texture) {
  return Array.from({ length: puffCount }, (_, index) => {
    const puff = new Sprite(
      new SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false }),
    );
    const angle = (index / puffCount) * Math.PI * 2;
    puff.userData = { x: Math.cos(angle) * 0.35, z: Math.sin(angle) * 0.35, phase: index * 1.7 };
    return puff;
  });
}

function placeSteam(steam: readonly Sprite[], ms: number) {
  steam.forEach((puff, index) => {
    const { rise, opacity } = steamPuff(ms, index);
    const x = Number(puff.userData.x);
    const z = Number(puff.userData.z);
    const sway = Math.sin(rise * 5 + Number(puff.userData.phase)) * 0.18 * rise;
    puff.position.set(x * (1 + rise) + sway, 0.75 + rise * 2.4, z * (1 + rise));
    puff.scale.setScalar(0.45 + rise * 1.4);
    puff.material.opacity = opacity;
  });
}

function keyLight() {
  const key = new DirectionalLight(0xffe2bd, 2.4);
  key.position.set(-3.5, 6, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  Object.assign(key.shadow.camera, { near: 1, far: 16, left: -3, right: 3, top: 3, bottom: -3 });
  key.shadow.camera.updateProjectionMatrix();
  return key;
}

/** Warm kitchen light: a honeyed key that casts the soft shadow, a sky fill and a copper rim. */
function addLights(scene: Scene) {
  const rim = new DirectionalLight(0xffc98a, 1.1);
  rim.position.set(3, 2.5, -4);
  scene.add(new HemisphereLight(0xfff1dc, 0x6b4a33, 1), keyLight(), rim);
  scene.add(new AmbientLight(0xffffff, 0.12));
}

function floor() {
  const ground = new Mesh(new PlaneGeometry(10, 10), new ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function makeRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
}

function freeScene(scene: Scene) {
  scene.traverse((object) => {
    if (object instanceof Sprite) {
      object.geometry.dispose();
      object.material.dispose();
      return;
    }
    if (!(object instanceof Mesh)) return;
    if (object.geometry instanceof BufferGeometry) object.geometry.dispose();
    // Disposing a shared material twice is harmless in three.js.
    if (object.material instanceof MeshStandardMaterial) object.material.dispose();
    if (object.material instanceof ShadowMaterial) object.material.dispose();
  });
}

/**
 * Builds the order-confirmed tagine on `canvas` and returns `render(ms)` to draw the scene at
 * any moment of its timeline, plus `dispose` to free the GPU resources.
 */
export function createTagineScene(canvas: HTMLCanvasElement, colours: TagineColours) {
  const renderer = makeRenderer(canvas);
  const scene = new Scene();
  const camera = new PerspectiveCamera(36, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
  camera.position.set(0, 2.6, 6.9);
  camera.lookAt(0, 0.95, 0);
  addLights(scene);
  const { base, lid, textures } = buildTagine(colours);
  const steamMap = steamTexture(colours.steam, colours.mist);
  const steam = buildSteam(steamMap);
  const turntable = new Group();
  turntable.add(base, buildDish(colours), lid);
  scene.add(floor(), turntable, ...steam);

  return {
    render(ms: number) {
      const { lift, tilt } = lidPose(ms);
      // The lid rises, tips back and slides away from the camera so the food shows.
      lid.position.set(0, 0.4 + lift, -lift * 0.55);
      lid.rotation.x = tilt;
      turntable.rotation.y = -0.35 + ms / 5000;
      placeSteam(steam, ms);
      renderer.render(scene, camera);
    },
    dispose() {
      freeScene(scene);
      for (const texture of [...textures, steamMap]) texture.dispose();
      renderer.dispose();
    },
  };
}

/**
 * Plays the order-confirmed tagine on `canvas`: the lid springs up and tips back, steam rises,
 * then `onDone` runs. Returns a stop function that frees the GPU resources.
 */
export function playTagine(canvas: HTMLCanvasElement, colours: TagineColours, onDone: () => void) {
  const scene = createTagineScene(canvas, colours);
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
    scene.render(ms);
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
    scene.dispose();
  };
}
