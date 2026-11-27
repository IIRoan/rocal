/** The header both apps write above a forwarded message. */
export const FORWARDED_MESSAGE_HEADER = "---------- Forwarded message ----------";

const replyQuoteHeader = /^On [\s\S]+ wrote:/;

/** The line both apps write above a reply's quoted message. */
export function formatReplyQuoteHeader(date: string, sender: string): string {
  return `On ${date}, ${sender} wrote:`;
}

/** Whether a block starts with the reply-quote header, so the quote under it can start folded. */
export function isReplyQuoteHeader(text: string): boolean {
  return replyQuoteHeader.test(text.trimStart());
}
