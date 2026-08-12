import type { JmapEmailMessage } from "./types";

/**
 * True when body payload is present. `bodyStructure` alone does not count —
 * list/thread metadata may include it without bodyValues.
 */
export function messageHasLoadedBody(message: JmapEmailMessage): boolean {
  return Boolean(
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

/**
 * Merge a body/metadata fetch without clobbering local keyword state.
 * Optimistic $seen / $flagged updates must survive slower Email/get responses.
 */
export function mergeMailMessagePreservingKeywords(
  existing: JmapEmailMessage,
  incoming: JmapEmailMessage,
): JmapEmailMessage {
  return {
    ...mergeMailMessage(existing, incoming),
    keywords: existing.keywords,
  };
}
