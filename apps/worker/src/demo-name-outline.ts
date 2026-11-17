import { readFile } from "node:fs/promises";
import { Blob, Buffer as ShapingBuffer, Face, Font, shape } from "harfbuzzjs";

// D-023: names are drawn as glyph outlines, so the raster never depends on system fonts.
const demoFontUrl = new URL("../assets/demo-fonts/ibm-plex-sans-arabic-600.ttf", import.meta.url);
// Glyph 0 is `.notdef`, the empty box a font draws for characters it does not have.
const notdefGlyph = 0;

export interface NameBox {
  readonly fontSize: number;
  readonly maxWidth: number;
}

export interface NameOutline {
  /** An SVG group with the baseline's start at the origin. */
  readonly svg: string;
  readonly width: number;
  readonly fontSize: number;
}

export async function readDemoFont(): Promise<Uint8Array> {
  return readFile(demoFontUrl);
}

interface ShapedName {
  readonly paths: string[];
  readonly advance: number;
}

function shapeName(font: Font, text: string): ShapedName {
  const buffer = new ShapingBuffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  shape(font, buffer);
  const positions = buffer.getGlyphPositions();
  const paths: string[] = [];
  let advance = 0;
  for (const [index, { codepoint: glyph }] of buffer.getGlyphInfos().entries()) {
    if (glyph === notdefGlyph) throw new Error("The demo font cannot draw this name.");
    const position = positions[index];
    if (!position) throw new Error("HarfBuzz returned fewer positions than glyphs.");
    const outline = font.glyphToPath(glyph);
    const at = `${(advance + position.xOffset).toString()} ${position.yOffset.toString()}`;
    if (outline !== "") paths.push(`<path transform="translate(${at})" d="${outline}"/>`);
    advance += position.xAdvance;
  }
  return { paths, advance };
}

/** Shapes names with HarfBuzz (Arabic joining, RTL order) and returns their outlines. */
export function createNameOutliner(fontData: Uint8Array) {
  const face = new Face(new Blob(fontData));
  const font = new Font(face);
  const unitsPerEm = face.upem;

  return (text: string, { fontSize, maxWidth }: NameBox): NameOutline => {
    const { paths, advance } = shapeName(font, text);
    const fullWidth = (advance * fontSize) / unitsPerEm;
    const fittedSize = fullWidth > maxWidth ? (fontSize * maxWidth) / fullWidth : fontSize;
    const scale = fittedSize / unitsPerEm;
    return {
      svg: `<g transform="scale(${scale.toString()} -${scale.toString()})">${paths.join("")}</g>`,
      width: (advance * fittedSize) / unitsPerEm,
      fontSize: fittedSize,
    };
  };
}
