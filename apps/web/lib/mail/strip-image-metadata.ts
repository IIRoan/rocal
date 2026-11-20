import {
  fitImageToMaxPixels,
  IMAGE_REENCODE_JPEG_QUALITY,
  imageFileNameForType,
  imageMetadataStripFailedNotice,
  mayStripImageMetadata,
  planImageMetadataStrip,
  type ReencodedImageType,
} from "@workspace/calendar-core";
import { toast } from "@workspace/ui/lib/toast";
import { readMailComposeSettings } from "./compose-settings";

export type ImageMetadataStripResult = {
  file: File;
  outcome: "unchanged" | "stripped" | "failed";
};

async function encodeBitmap(
  bitmap: ImageBitmap,
  type: ReencodedImageType,
): Promise<Blob> {
  const { width, height } = fitImageToMaxPixels(bitmap.width, bitmap.height);
  const options = { type, quality: IMAGE_REENCODE_JPEG_QUALITY };
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob(options);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))),
      options.type,
      options.quality,
    ),
  );
}

function encodedType(blob: Blob, fallback: ReencodedImageType): ReencodedImageType {
  return blob.type === "image/jpeg" || blob.type === "image/png" || blob.type === "image/webp"
    ? blob.type
    : fallback;
}

/** Re-encodes a still photo in memory so its location and camera metadata stay on this device; decoding applies its rotation first. */
export async function stripImageMetadata(file: File): Promise<ImageMetadataStripResult> {
  if (!mayStripImageMetadata(file.type)) return { file, outcome: "unchanged" };
  const bytes = await file.arrayBuffer().then(
    (buffer) => new Uint8Array(buffer),
    () => null,
  );
  if (!bytes) return { file, outcome: "failed" };
  const plan = planImageMetadataStrip({ name: file.name, type: file.type, bytes });
  if (plan.action === "keep") return { file, outcome: "unchanged" };
  const reencode = async () => {
    const bitmap = await createImageBitmap(file);
    const blob = await encodeBitmap(bitmap, plan.outputType).finally(() => bitmap.close());
    const type = encodedType(blob, plan.outputType);
    const name = type === plan.outputType ? plan.outputName : imageFileNameForType(plan.outputName, type);
    return new File([blob], name, { type, lastModified: file.lastModified });
  };
  return reencode().then(
    (stripped): ImageMetadataStripResult => ({ file: stripped, outcome: "stripped" }),
    (): ImageMetadataStripResult => ({ file, outcome: "failed" }),
  );
}

/** Applies the compose setting to picked, dropped or pasted files; one that cannot be re-encoded is kept as is with a notice. */
export async function prepareOutgoingImageFiles(files: File[]): Promise<File[]> {
  if (!readMailComposeSettings().stripImageMetadata) return files;
  const results = await Promise.all(files.map(stripImageMetadata));
  for (const result of results) {
    if (result.outcome === "failed") toast.error(imageMetadataStripFailedNotice(result.file.name));
  }
  return results.map((result) => result.file);
}
