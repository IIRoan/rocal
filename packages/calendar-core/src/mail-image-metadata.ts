export const IMAGE_REENCODE_JPEG_QUALITY = 0.92;
/** iOS Safari's canvas limit; larger photos are scaled down so every browser gives the same result. */
export const IMAGE_REENCODE_MAX_PIXELS = 16_777_216;

export type ReencodedImageType = "image/jpeg" | "image/png" | "image/webp";

export type ImageMetadataStripPlan =
  | { action: "keep" }
  | { action: "reencode"; outputType: ReencodedImageType; outputName: string };

type SniffedImageFormat = "jpeg" | "png" | "webp" | "heic";

const DECLARED_TYPES: Record<SniffedImageFormat, readonly string[]> = {
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heic: ["image/heic", "image/heif"],
};

const OUTPUT_TYPES: Record<SniffedImageFormat, ReencodedImageType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/jpeg",
};

const EXTENSIONS: Record<ReencodedImageType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const HEIC_BRANDS = new Set(["heic", "heix", "mif1", "msf1"]);
/** Types that say nothing about the content (HEIC on Chrome and Firefox off Apple platforms), so the bytes decide. */
const UNTYPED = new Set(["", "application/octet-stream"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = "";
  for (let index = start; index < start + length && index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[index] ?? 0);
  }
  return text;
}

function sniffImageFormat(bytes: Uint8Array): SniffedImageFormat | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (ascii(bytes, 4, 4) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 4))) return "heic";
  return null;
}

/** An animated PNG declares `acTL` before its first `IDAT`. */
function isAnimatedPng(bytes: Uint8Array): boolean {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length =
      ((bytes[offset] ?? 0) * 0x1000000) +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL") return true;
    if (type === "IDAT") return false;
    offset += 12 + length;
  }
  return false;
}

/** An animated WebP sets the animation bit in its `VP8X` header flags. */
function isAnimatedWebp(bytes: Uint8Array): boolean {
  return ascii(bytes, 12, 4) === "VP8X" && ((bytes[20] ?? 0) & 0x02) !== 0;
}

/** Swaps the file extension for one that matches the encoded type. */
export function imageFileNameForType(name: string, type: ReencodedImageType): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base || "image"}${EXTENSIONS[type]}`;
}

/** True for the declared types a re-encode can apply to, so other files need not be read at all. */
export function mayStripImageMetadata(type: string | null | undefined): boolean {
  const declared = (type ?? "").toLowerCase();
  return UNTYPED.has(declared) || Object.values(DECLARED_TYPES).some((types) => types.includes(declared));
}

/** Decides whether an outgoing image is re-encoded to drop its metadata; GIFs, animations and unrecognized files stay as they are. */
export function planImageMetadataStrip(file: {
  name: string;
  type: string | null | undefined;
  bytes: Uint8Array;
}): ImageMetadataStripPlan {
  const format = sniffImageFormat(file.bytes);
  const declared = (file.type ?? "").toLowerCase();
  if (!format || !(UNTYPED.has(declared) || DECLARED_TYPES[format].includes(declared))) return { action: "keep" };
  if (format === "png" && isAnimatedPng(file.bytes)) return { action: "keep" };
  if (format === "webp" && isAnimatedWebp(file.bytes)) return { action: "keep" };
  const outputType = OUTPUT_TYPES[format];
  return {
    action: "reencode",
    outputType,
    outputName: format === "heic" ? imageFileNameForType(file.name, outputType) : file.name,
  };
}

/** Pixel size after scaling down, aspect kept, to at most `IMAGE_REENCODE_MAX_PIXELS`. */
export function fitImageToMaxPixels(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width * height <= IMAGE_REENCODE_MAX_PIXELS) return { width, height };
  const scale = Math.sqrt(IMAGE_REENCODE_MAX_PIXELS / (width * height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export const IMAGE_METADATA_UPDATE_NOTICE = "Update Solace to remove photo location data.";

export function imageMetadataStripFailedNotice(name: string): string {
  return `Couldn't remove location data from ${name}. It's attached as is.`;
}
