import { buildCasbahScene, type House } from "./casbah-scene";
import { heroPalette as colors } from "./hero-palette";

// The static fallback for the hero (DESIGN §8.1): the same seeded scene, drawn as SVG with an
// oblique projection from the sea. It renders on the server, so it is also the LCP image.

export const heroSeed = 1962;
const halfSun = 18;
const width = 1600;
const height = 900;
const horizon = 700;
const scaleX = 22;
const scaleY = 12;
const depthLift = 6;

function project(x: number, y: number, z: number): { left: number; top: number } {
  return { left: width / 2 + x * scaleX, top: horizon - z * depthLift - y * scaleY };
}

function HouseShape({ house }: { house: House }) {
  const base = project(house.x - house.width / 2, house.y, house.z);
  const faceHeight = house.height * scaleY;
  const faceWidth = house.width * scaleX;
  const roofHeight = house.depth * depthLift * 0.5;
  return (
    <g opacity={house.tone}>
      <rect
        fill={colors.roof}
        x={base.left}
        y={base.top - faceHeight - roofHeight}
        width={faceWidth}
        height={roofHeight}
      />
      <rect
        className="casbah-wall"
        fill={colors.wall}
        x={base.left}
        y={base.top - faceHeight}
        width={faceWidth}
        height={faceHeight}
      />
    </g>
  );
}

export function CasbahPoster({ label }: { label: string }) {
  const scene = buildCasbahScene(heroSeed);
  // Painter's order: far houses first.
  const houses = [...scene.houses].sort((left, right) => right.z - left.z);
  const tower = project(scene.tower.x, scene.tower.y, scene.tower.z);
  const trail = scene.trail.map((point) => project(point.x, point.y, point.z));
  const sun = project(-halfSun, 30, 40);
  return (
    <svg
      className="casbah-poster"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="casbah-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.nightSky} />
          <stop offset="0.45" stopColor={colors.duskSky} />
          <stop offset="1" stopColor={colors.goldenSky} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill="url(#casbah-sky)" />
      <circle fill={colors.saffron} cx={sun.left} cy={sun.top} r={70} />
      <rect fill={colors.sea} x={0} y={horizon} width={width} height={height - horizon} />
      <rect
        fill={colors.shade}
        x={tower.left - scene.tower.radius * scaleX}
        y={tower.top - scene.tower.height * scaleY}
        width={scene.tower.radius * 2 * scaleX}
        height={scene.tower.height * scaleY}
      />
      {houses.map((house, index) => (
        <HouseShape key={index} house={house} />
      ))}
      {scene.domes.map((dome, index) => {
        const center = project(dome.x, dome.y, dome.z);
        return (
          <ellipse
            key={index}
            fill={colors.roof}
            cx={center.left}
            cy={center.top}
            rx={dome.radius * scaleX}
            ry={dome.radius * scaleY * 0.8}
          />
        );
      })}
      <polyline
        className="casbah-trail"
        stroke={colors.saffron}
        points={trail.map((point) => `${String(point.left)},${String(point.top)}`).join(" ")}
      />
    </svg>
  );
}
