import type { MailAttachmentPreviewKind } from "@workspace/calendar-core";

export type ReaderAttachmentIcon = "image" | "file-text" | "file";

export function readerAttachmentIcon(
  previewKind: MailAttachmentPreviewKind | null,
): ReaderAttachmentIcon {
  if (previewKind === "image") return "image";
  if (previewKind === "pdf" || previewKind === "text") return "file-text";
  return "file";
}

export function formatAttachmentCount(count: number): string {
  return `${count} ${count === 1 ? "Attachment" : "Attachments"}`;
}
