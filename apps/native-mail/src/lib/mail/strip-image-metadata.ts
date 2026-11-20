import {
  fitImageToMaxPixels,
  IMAGE_METADATA_UPDATE_NOTICE,
  IMAGE_REENCODE_JPEG_QUALITY,
  imageMetadataStripFailedNotice,
  planImageMetadataStrip,
  type ReencodedImageType,
} from "@workspace/calendar-core";
import { decodeBase64ToBytes } from "./binary-utils";

export type PickedImageFile = { name: string; type: string | undefined; bytes: Uint8Array };

/** The file to attach, plus a notice when its metadata could not be removed. */
export type StrippedImageFile = PickedImageFile & { notice?: string };

// Lazy so a JS update on an older binary without these native modules fails here, not at launch.
const loadImageModules = () =>
  Promise.all([import("expo-image-manipulator"), import("expo-file-system/legacy")]);

async function reencode(
  [{ ImageManipulator, SaveFormat }, FileSystem]: Awaited<ReturnType<typeof loadImageModules>>,
  uri: string,
  outputType: ReencodedImageType,
): Promise<Uint8Array> {
  const format = {
    "image/jpeg": SaveFormat.JPEG,
    "image/png": SaveFormat.PNG,
    "image/webp": SaveFormat.WEBP,
  }[outputType];
  const decoded = await ImageManipulator.manipulate(uri).renderAsync();
  const size = fitImageToMaxPixels(decoded.width, decoded.height);
  const image =
    size.width === decoded.width
      ? decoded
      : await ImageManipulator.manipulate(decoded).resize(size).renderAsync();
  const saved = await image.saveAsync({
    format,
    compress: IMAGE_REENCODE_JPEG_QUALITY,
    base64: true,
  });
  // The saved copy is plaintext in the cache, so it never outlives this call.
  await FileSystem.deleteAsync(saved.uri, { idempotent: true }).catch(() => undefined);
  if (!saved.base64) throw new Error("Image encoding returned no data");
  return decodeBase64ToBytes(saved.base64);
}

/** Re-encodes a picked still photo so its location and camera metadata stay on this device; anything that fails is attached as is with a notice. */
export async function stripPickedImageMetadata(
  uri: string,
  file: PickedImageFile,
): Promise<StrippedImageFile> {
  const plan = planImageMetadataStrip(file);
  if (plan.action === "keep") return file;
  const modules = await loadImageModules().catch(() => null);
  if (!modules) return { ...file, notice: IMAGE_METADATA_UPDATE_NOTICE };
  return reencode(modules, uri, plan.outputType).then(
    (bytes): StrippedImageFile => ({ name: plan.outputName, type: plan.outputType, bytes }),
    (): StrippedImageFile => ({ ...file, notice: imageMetadataStripFailedNotice(file.name) }),
  );
}
