export type MailAttachmentPreviewKind = "image" | "pdf" | "text";

const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SAFE_IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "webp",
]);

const SAFE_TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/xml",
  "text/yaml",
]);

const SAFE_TEXT_EXTENSIONS = new Set([
  "conf",
  "csv",
  "ini",
  "json",
  "log",
  "md",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

export function normalizeAttachmentMimeType(type?: string | null): string {
  return type?.toLowerCase().split(";")[0]?.trim() ?? "";
}

export function getAttachmentExtension(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "";
  }
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

export function resolveAttachmentPreviewKind(input: {
  name?: string | null;
  type?: string | null;
}): MailAttachmentPreviewKind | null {
  const mimeType = normalizeAttachmentMimeType(input.type);
  const extension = getAttachmentExtension(input.name);

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    SAFE_IMAGE_MIME_TYPES.has(mimeType) ||
    SAFE_IMAGE_EXTENSIONS.has(extension)
  ) {
    return "image";
  }

  if (
    SAFE_TEXT_MIME_TYPES.has(mimeType) ||
    SAFE_TEXT_EXTENSIONS.has(extension)
  ) {
    return "text";
  }

  return null;
}
