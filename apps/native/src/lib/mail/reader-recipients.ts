import {
  isCurrentUserMailAddress,
  type MailAttachmentPreviewKind,
} from "@workspace/calendar-core";
import type { MailAddress } from "./types";

function recipientNames(
  recipients: MailAddress[] | undefined,
  currentUserEmail?: string | null,
): string {
  return (recipients ?? [])
    .map((recipient) =>
      isCurrentUserMailAddress(recipient.email, currentUserEmail)
        ? "me"
        : recipient.name?.trim() || recipient.email,
    )
    .join(", ");
}

/** Single reader line such as "To: Kevin, me, Cc: Andrew" (truncated by the view). */
export function formatReaderRecipientLine(
  to: MailAddress[] | undefined,
  cc: MailAddress[] | undefined,
  currentUserEmail?: string | null,
): string {
  const toNames = recipientNames(to, currentUserEmail);
  const ccNames = recipientNames(cc, currentUserEmail);
  return [toNames && `To: ${toNames}`, ccNames && `Cc: ${ccNames}`]
    .filter(Boolean)
    .join(", ");
}

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
