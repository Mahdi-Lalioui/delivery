// DESIGN §8.1 "Casbah at golden hour": a pure, seeded description of the scene. The 3D hero and
// the static poster both draw from it, so the fallback matches the live version.

export type House = {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  tone: number;
  /** Scroll share (0–1) at which this house's window lights up. */
  lightAt: number;
};
type Point = { x: number; y: number; z: number };
export type CasbahScene = {
  houses: House[];
  domes: { x: number; y: number; z: number; radius: number }[];
  tower: { x: number; y: number; z: number; radius: number; height: number };
  kitchen: Point;
  home: Point;
  trail: Point[];
};

const houseColumns = 48;
const houseRows = 40;
const halfWidth = 36;
const depth = 32;
const maxLitShare = 0.85;

/** mulberry32: small, fast, deterministic. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Terraced hillside: rises away from the sea (z) with gentle seeded bumps, stepped into terraces. */
function hillHeight(x: number, z: number, phase: number): number {
  const slope = (z / depth) * 14;
  const bumps = Math.sin(x * 0.21 + phase) * 1.4 + Math.cos(z * 0.33 - phase) * 1.1;
  const ridge = Math.max(0, 6 - Math.abs(x) * 0.18);
  return Math.max(0, Math.round((slope + bumps + ridge) * 2) / 2);
}

/** Matches the terrain heights used to place the buildings. */
export function terrainSampler(seed: number) {
  const phase = seededRandom(seed)() * Math.PI * 2;
  return (x: number, z: number) => hillHeight(x, z, phase);
}

function buildHouses(random: () => number, phase: number): House[] {
  const houses: House[] = [];
  for (let row = 0; row < houseRows; row += 1) {
    for (let column = 0; column < houseColumns; column += 1) {
      // Thin the grid so streets and stairways appear between houses.
      if (random() < 0.12) continue;
      const x =
        -halfWidth + (column + between(random, 0.1, 0.9)) * ((2 * halfWidth) / houseColumns);
      const z = 2 + (row + between(random, 0.1, 0.9)) * (depth / houseRows);
      houses.push({
        x,
        y: hillHeight(x, z, phase),
        z,
        width: between(random, 0.8, 1.6),
        depth: between(random, 0.8, 1.6),
        height: between(random, 0.6, 1.4),
        rotation: between(random, -0.15, 0.15),
        tone: between(random, 0.88, 1),
        lightAt: random() * 0.999,
      });
    }
  }
  return houses;
}

function pick(houses: readonly House[], index: number): Point {
  const house = houses[Math.min(houses.length - 1, Math.max(0, index))];
  if (house === undefined) return { x: 0, y: 0, z: 0 };
  return { x: house.x, y: house.y + house.height, z: house.z };
}

function buildTrail(kitchen: Point, home: Point, peak: number): Point[] {
  const steps = 6;
  const middle = Array.from({ length: steps - 1 }, (_, index) => {
    const share = (index + 1) / steps;
    const lift = Math.sin(share * Math.PI) * peak;
    return {
      x: kitchen.x + (home.x - kitchen.x) * share,
      y: kitchen.y + (home.y - kitchen.y) * share + lift,
      z: kitchen.z + (home.z - kitchen.z) * share,
    };
  });
  return [kitchen, ...middle, home];
}

export function buildCasbahScene(seed: number): CasbahScene {
  const random = seededRandom(seed);
  const phase = random() * Math.PI * 2;
  const houses = buildHouses(random, phase);
  const domes = Array.from({ length: 4 }, () => {
    const x = between(random, -halfWidth * 0.7, halfWidth * 0.7);
    const z = between(random, depth * 0.3, depth * 0.9);
    return { x, y: hillHeight(x, z, phase) + 1.2, z, radius: between(random, 1.2, 2) };
  });
  const towerX = between(random, -halfWidth * 0.3, halfWidth * 0.3);
  const towerZ = depth * 0.75;
  const tower = {
    x: towerX,
    y: hillHeight(towerX, towerZ, phase),
    z: towerZ,
    radius: 0.6,
    height: 9,
  };
  const kitchen = pick(houses, Math.floor(houses.length * 0.2));
  const home = pick(houses, Math.floor(houses.length * 0.85));
  const roofTop = Math.max(...houses.map((house) => house.y + house.height));
  return { houses, domes, tower, kitchen, home, trail: buildTrail(kitchen, home, roofTop * 0.6) };
}

export type HeroCapabilities = {
  hasWebgl2: boolean;
  deviceMemoryGb: number | undefined;
  cores: number;
  isSaveData: boolean;
  isReducedMotion: boolean;
};

/** DESIGN §8.1 gate: WebGL2, ≥ 4 GB (or unknown), ≥ 4 cores, no Save-Data, motion allowed. */
export function canRunHero3d(capabilities: HeroCapabilities): boolean {
  const { hasWebgl2, deviceMemoryGb, cores, isSaveData, isReducedMotion } = capabilities;
  const hasMemory = deviceMemoryGb === undefined || deviceMemoryGb >= 4;
  return hasWebgl2 && hasMemory && cores >= 4 && !isSaveData && !isReducedMotion;
}

export function heroDevicePixelRatio(input: {
  devicePixelRatio: number;
  isMobile: boolean;
}): number {
  return Math.min(input.devicePixelRatio, input.isMobile ? 1.25 : 1.75);
}

/** Scroll progress (0–1) → how far into blue hour we are and the share of lit windows. */
export function sceneTime(scroll: number): { dusk: number; litShare: number } {
  const dusk = Math.min(1, Math.max(0, scroll));
  // Windows start lighting after the first fifth of the scroll, like dinner time.
  const litShare = Math.round(Math.max(0, (dusk - 0.2) / 0.8) * maxLitShare * 1000) / 1000;
  return { dusk, litShare };
}
