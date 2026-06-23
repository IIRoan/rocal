import type { JmapEmailMessage } from "./types";

/** True when JMAP returned body fields (triggers server MIME expansion). */
export function messageHasLoadedBody(message: JmapEmailMessage): boolean {
  return Boolean(
    message.bodyStructure ||
      message.bodyValues ||
      message.textBody?.length ||
      message.htmlBody?.length ||
      message.attachments?.length,
  );
}

/** Merge list preview rows with full-body fetches without dropping loaded content. */
export function mergeMailMessage(
  existing: JmapEmailMessage,
  incoming: JmapEmailMessage,
): JmapEmailMessage {
  if (messageHasLoadedBody(incoming)) {
    return { ...existing, ...incoming };
  }

  if (messageHasLoadedBody(existing)) {
    return {
      ...existing,
      ...incoming,
      bodyStructure: existing.bodyStructure,
      bodyValues: existing.bodyValues,
      textBody: existing.textBody,
      htmlBody: existing.htmlBody,
      attachments: existing.attachments,
    };
  }

  return { ...existing, ...incoming };
}
