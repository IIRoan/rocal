import {
  SOLACE_AVATAR_UPLOAD_SIZE_PX,
  resolveSolaceProfileAvatarUrl,
} from "@workspace/calendar-core";
import { getApiBaseUrl } from "./api-url";

/** Web avatars are at most ~56 CSS px, so one variant stays sharp on 2x screens. */
const WEB_AVATAR_PIXELS = 128;

export const MAX_AVATAR_ZOOM = 4;

/** Uploaded pictures are stored as API-relative paths on `user.image`. */
export function resolveAvatarUrl(
  image: string | null | undefined,
): string | undefined {
  return (
    resolveSolaceProfileAvatarUrl(image, getApiBaseUrl(), WEB_AVATAR_PIXELS) ??
    undefined
  );
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Crop square centred on (centerX, centerY) in source pixels; zoom 1 fits the short edge. */
export interface AvatarCrop {
  centerX: number;
  centerY: number;
  zoom: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function avatarCropSide(image: ImageSize, zoom: number): number {
  return Math.min(image.width, image.height) / zoom;
}

export function initialAvatarCrop(image: ImageSize): AvatarCrop {
  return { centerX: image.width / 2, centerY: image.height / 2, zoom: 1 };
}

/** Keeps the crop square inside the image so the result never has empty edges. */
export function clampAvatarCrop(image: ImageSize, crop: AvatarCrop): AvatarCrop {
  const zoom = clamp(crop.zoom, 1, MAX_AVATAR_ZOOM);
  const half = avatarCropSide(image, zoom) / 2;
  return {
    zoom,
    centerX: clamp(crop.centerX, half, image.width - half),
    centerY: clamp(crop.centerY, half, image.height - half),
  };
}

/** Draws only the chosen square; the canvas round-trip also drops EXIF such as location. */
export function encodeAvatarCrop(
  image: CanvasImageSource & ImageSize,
  crop: AvatarCrop,
): string {
  const side = avatarCropSide(image, crop.zoom);
  const size = Math.round(Math.min(side, SOLACE_AVATAR_UPLOAD_SIZE_PX));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Your browser could not process this image.");
  }
  context.fillStyle = "white";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.centerX - side / 2,
    crop.centerY - side / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  // High quality because the API re-encodes this into its WebP variants.
  return canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "";
}
