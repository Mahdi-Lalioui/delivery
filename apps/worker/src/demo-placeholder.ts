import palettes from "@zaafran/tokens/palettes.json" with { type: "json" };
import sharp from "sharp";
import { cuisineIcon } from "./demo-cuisine-icons.js";
import type { NameBox, NameOutline } from "./demo-name-outline.js";

// DESIGN §6 demo imagery: gradient + dish icon + name, 4:3 at the largest variant width.
const width = 1280;
const height = 960;
const iconSize = 320;
const iconTop = 140;
const nameMaxWidth = 1120;
const arabicName = { baseline: 660, fontSize: 96 } as const;
const frenchName = { baseline: 800, fontSize: 64 } as const;

// Light token pairs only: ink text keeps its contrast on every one of them. The golden-hour
// gradient stays reserved for the landing hero (DESIGN §3).
const { light } = palettes;
const gradients = [
  [light["surface-2"], light["primary-hover"]],
  [light["warning-bg"], light.primary],
  [light.bg, light["surface-3"]],
  [light["info-bg"], light["surface-2"]],
  [light["success-bg"], light["surface-2"]],
  [light["surface-3"], light["primary-hover"]],
] as const;

export interface DemoDishArt {
  readonly itemId: string;
  readonly cuisine: string;
  readonly names: { readonly ar: string; readonly fr: string };
}

type Outline = (text: string, box: NameBox) => NameOutline;

/** FNV-1a over the id, so demo art is stable without randomness and every character counts. */
function gradientFor(itemId: string) {
  let hash = 0x811c9dc5;
  for (const character of itemId) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  }
  return gradients[hash % gradients.length] ?? gradients[0];
}

function centredName(outline: Outline, text: string, line: typeof arabicName | typeof frenchName) {
  const name = outline(text, { fontSize: line.fontSize, maxWidth: nameMaxWidth });
  const left = (width - name.width) / 2;
  return `<g transform="translate(${left.toString()} ${line.baseline.toString()})">${name.svg}</g>`;
}

/** Renders the dish's placeholder as a PNG for the normal photo pipeline (D-023). */
export async function renderDemoPlaceholder(dish: DemoDishArt, outline: Outline): Promise<Buffer> {
  const [from, to] = gradientFor(dish.itemId);
  const iconLeft = (width - iconSize) / 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toString()}" height="${height.toString()}">`,
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`,
    `</linearGradient></defs>`,
    `<rect width="100%" height="100%" fill="url(#sky)"/>`,
    `<g transform="translate(${iconLeft.toString()} ${iconTop.toString()}) scale(${(iconSize / 24).toString()})">`,
    cuisineIcon(dish.cuisine),
    `</g>`,
    `<g fill="${light.text}">`,
    centredName(outline, dish.names.ar, arabicName),
    centredName(outline, dish.names.fr, frenchName),
    `</g></svg>`,
  ].join("");
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
