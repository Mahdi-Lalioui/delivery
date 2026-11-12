import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";

export type TagineColours = {
  clay: string;
  glaze: string;
  saffron: string;
  couscous: string;
  steam: string;
  /** A soft outline tone so white steam still reads on a pale background. */
  mist: string;
};

const segments = 72;

function shaded(geometry: BufferGeometry, material: Material) {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function lathe(points: readonly (readonly [number, number])[]) {
  return new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    segments,
  );
}

/** An eight-point zellige star centred on (x, y). */
function star(context: CanvasRenderingContext2D, centre: { x: number; y: number }, size: number) {
  const { x, y } = centre;
  context.beginPath();
  for (let point = 0; point < 16; point += 1) {
    const radius = point % 2 === 0 ? size : size * 0.45;
    const angle = (point / 16) * Math.PI * 2;
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  context.closePath();
  context.fill();
}

/** A strip of saffron stars between thin rules on the glaze, repeated around the pot. */
function zelligeBand(colours: TagineColours, rows: { top: number; bottom: number }): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = colours.glaze;
    context.fillRect(0, 0, 1024, 256);
    const top = rows.top * 256;
    const bottom = rows.bottom * 256;
    const middle = (top + bottom) / 2;
    context.fillStyle = colours.saffron;
    context.fillRect(0, top, 1024, 5);
    context.fillRect(0, bottom - 5, 1024, 5);
    for (let index = 0; index < 16; index += 1) {
      const x = 32 + index * 64;
      context.fillStyle = colours.saffron;
      star(context, { x, y: middle }, (bottom - top) * 0.36);
      context.fillStyle = colours.couscous;
      star(context, { x: x + 32, y: middle }, (bottom - top) * 0.14);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function glazed(map: Texture) {
  return new MeshPhysicalMaterial({
    map,
    roughness: 0.32,
    clearcoat: 0.9,
    clearcoatRoughness: 0.2,
  });
}

/** The lid's bell: a full shoulder that narrows into a chimney, sampled as a smooth curve. */
function lidProfile(): [number, number][] {
  const steps = 22;
  const bell = Array.from({ length: steps + 1 }, (_, step): [number, number] => {
    const t = step / steps;
    return [Math.max(0.17, 1.14 * Math.pow(1 - t, 0.42)), 0.12 + t * 1.3];
  });
  return [[1.2, 0], [1.21, 0.06], [1.16, 0.12], ...bell];
}

function buildBase(colours: TagineColours, band: Texture) {
  const clay = new MeshPhysicalMaterial({
    color: colours.clay,
    roughness: 0.45,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
  });
  const plate = shaded(
    lathe([
      [0, 0],
      [0.98, 0],
      [1.04, 0.04],
      [1.5, 0.42],
      [1.6, 0.5],
      [1.6, 0.54],
      [1.38, 0.54],
      [1.36, 0.5],
      [1.2, 0.36],
      [0, 0.34],
    ]),
    clay,
  );
  plate.material.side = DoubleSide;
  // The glazed zellige ring sits on the flat top of the rim, facing the diner.
  const ring = shaded(
    lathe([
      [1.6, 0.545],
      [1.38, 0.545],
    ]),
    glazed(band),
  );
  const base = new Group();
  base.add(plate, ring);
  return base;
}

function buildLid(colours: TagineColours, band: Texture) {
  const lid = new Group();
  const bell = shaded(lathe(lidProfile()), glazed(band));
  const saffron = new MeshPhysicalMaterial({
    color: colours.saffron,
    roughness: 0.3,
    clearcoat: 0.8,
  });
  const rim = shaded(new CylinderGeometry(1.19, 1.22, 0.1, segments), saffron);
  rim.position.y = 0.05;
  const knob = shaded(
    lathe([
      [0, 0],
      [0.2, 0.02],
      [0.27, 0.1],
      [0.24, 0.2],
      [0.1, 0.27],
      [0, 0.28],
    ]),
    saffron,
  );
  knob.position.y = 1.4;
  lid.add(bell, rim, knob);
  lid.position.y = 0.4;
  return lid;
}

/** The pot: a glazed clay base and a bell-shaped glazed lid, plus the textures to free. */
export function buildTagine(colours: TagineColours) {
  const baseBand = zelligeBand(colours, { top: 0.12, bottom: 0.88 });
  const lidBand = zelligeBand(colours, { top: 0.72, bottom: 0.94 });
  return {
    base: buildBase(colours, baseBand),
    lid: buildLid(colours, lidBand),
    textures: [baseBand, lidBand],
  };
}

const moundRadius = 1.08;
const moundHeight = 0.45;

/** The couscous surface's height at `radius` from the centre, so garnish sits on top. */
function onMound(radius: number): number {
  const ratio = Math.min(1, radius / moundRadius);
  return moundHeight * Math.sqrt(1 - ratio * ratio);
}

function carrot(colour: string, angle: number) {
  const spear = shaded(
    new ConeGeometry(0.075, 0.62, 12),
    new MeshStandardMaterial({ color: colour, roughness: 0.5 }),
  );
  spear.rotation.z = Math.PI / 2 - 0.42;
  const arm = new Group();
  arm.add(spear);
  spear.position.set(0.5, onMound(0.5) + 0.04, 0);
  arm.rotation.y = angle;
  return arm;
}

function chickpeas(colour: string) {
  const material = new MeshStandardMaterial({ color: colour, roughness: 0.6 });
  return Array.from({ length: 10 }, (_, index) => {
    const pea = shaded(new SphereGeometry(0.06, 10, 8), material);
    const angle = index * 2.4;
    const radius = 0.55 + (index % 3) * 0.12;
    pea.position.set(Math.cos(angle) * radius, onMound(radius) + 0.03, Math.sin(angle) * radius);
    return pea;
  });
}

/** What the lid reveals: a couscous mound crowned with meat, carrot spears and chickpeas. */
export function buildDish(colours: TagineColours) {
  const dish = new Group();
  const mound = shaded(
    new SphereGeometry(moundRadius, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new MeshStandardMaterial({ color: colours.couscous, roughness: 0.95 }),
  );
  mound.scale.set(1, moundHeight / moundRadius, 1);
  const meat = shaded(
    new SphereGeometry(0.26, 20, 14),
    new MeshStandardMaterial({ color: colours.clay, roughness: 0.55 }),
  );
  meat.scale.set(1, 0.75, 1);
  meat.position.y = moundHeight + 0.06;
  dish.add(mound, meat, ...chickpeas(colours.steam));
  for (let index = 0; index < 7; index += 1) {
    dish.add(carrot(colours.saffron, (index / 7) * Math.PI * 2));
  }
  dish.position.y = 0.34;
  return dish;
}
