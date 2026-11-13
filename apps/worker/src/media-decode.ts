import sharp from "sharp";

// HEVC HEIC goes through the bounded libheif helper instead (D-007).
type SharpContentType = "image/jpeg" | "image/png" | "image/webp";

const expectedFormat = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const satisfies Record<SharpContentType, string>;

interface DecodeOptions {
  readonly contentType: SharpContentType;
  readonly maxPixels: number;
}

export interface RawImage {
  readonly pixels: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: 4;
}

export type DecodeResult =
  | ({ readonly kind: "decoded" } & RawImage)
  | {
      readonly kind: "rejected";
      readonly reason: "undecodable" | "type_mismatch" | "too_many_pixels";
    };

async function readHeader(input: Buffer) {
  try {
    return await sharp(input).metadata();
  } catch {
    return undefined;
  }
}

/**
 * Decodes an upload to oriented, metadata-free RGBA after checking its real format and size.
 * Raw pixels cannot carry EXIF, ICC or XMP, so every later encode starts clean.
 */
export async function decodeUpload(input: Buffer, options: DecodeOptions): Promise<DecodeResult> {
  const header = await readHeader(input);
  if (!header) return { kind: "rejected", reason: "undecodable" };
  if (header.format !== expectedFormat[options.contentType]) {
    return { kind: "rejected", reason: "type_mismatch" };
  }
  if (header.width * header.height > options.maxPixels) {
    return { kind: "rejected", reason: "too_many_pixels" };
  }
  try {
    const { data, info } = await sharp(input, {
      failOn: "truncated",
      limitInputPixels: options.maxPixels,
    })
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { kind: "decoded", pixels: data, width: info.width, height: info.height, channels: 4 };
  } catch {
    return { kind: "rejected", reason: "undecodable" };
  }
}
