import { resolveAttachmentPreviewKind } from "./attachment-preview";

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
  txt: "text/plain",
  json: "application/json",
  xml: "application/xml",
  csv: "text/csv",
};

export function getAttachmentExtension(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "";
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === trimmed.length - 1) return "";
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

export function inferAttachmentMimeType(
  name: string,
  type?: string | null,
): string {
  const normalized = type?.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized && normalized !== "application/octet-stream") {
    return normalized;
  }
  const fromName = MIME_BY_EXTENSION[getAttachmentExtension(name)];
  if (fromName) return fromName;
  const previewKind = resolveAttachmentPreviewKind({ name, type });
  if (previewKind === "image") return "image/png";
  if (previewKind === "pdf") return "application/pdf";
  if (previewKind === "text") return "text/plain";
  return "application/octet-stream";
}

function sanitizeBaseName(name: string, extension: string): string {
  const withoutExt = name.replace(new RegExp(`\\.${extension}$`, "i"), "");
  const sanitized =
    withoutExt.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_") ||
    "attachment";
  return sanitized.slice(0, 80);
}

/** Builds a cache file path that preserves the original extension. */
export function buildAttachmentCachePath(
  cacheKey: string,
  fileName: string,
  mimeType?: string | null,
  cacheDirectory = "",
): string {
  const mime = inferAttachmentMimeType(fileName, mimeType);
  let extension = getAttachmentExtension(fileName);
  if (!extension) {
    extension =
      Object.entries(MIME_BY_EXTENSION).find(([, value]) => value === mime)?.[0] ??
      "bin";
  }
  const base = sanitizeBaseName(fileName, extension);
  const safeKey = cacheKey.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 48);
  return `${cacheDirectory}${base}-${safeKey}.${extension}`;
}
