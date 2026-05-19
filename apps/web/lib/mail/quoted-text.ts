export type QuoteSplit = {
  body: string;
  quote: string | null;
};

/**
 * Regex patterns that identify the beginning of a quoted reply block in
 * plaintext email bodies. Ordered from most-specific to least-specific so the
 * first match wins.
 */
const PLAINTEXT_QUOTE_STARTERS: RegExp[] = [
  // App-generated separator: "\n\n---\nOn <date>, <email> wrote:"
  // Handles optional trailing whitespace on the --- line and optional extra blank lines
  /\n\n---[ \t]*\n(?:[ \t]*\n)*(?=On .+?wrote:)/,
  // ISO-date style: "On DD/MM/YYYY, HH:MM:SS, email wrote:" (flexible separators)
  /\n\n(?=On \d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}.+?wrote:)/,
  // Gmail standard long form: "On Mon, 1 Jan 2026 at 12:00, Name <email> wrote:"
  /\n\n(?=On (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s.+?wrote:\s*\n)/,
  // Generic "On ... wrote:" (loose match covering locale-format dates)
  /\n\n(?=On .{5,120}wrote:\s*\n)/,
  // Dash separator (2+ dashes, optional trailing whitespace) followed by attribution
  /\n[-—]{2,}[ \t]*\n(?:[ \t]*\n)*(?=On .+?wrote:)/,
  // Classic Outlook "---- Original Message ----" separator
  /\n[-]{3,}\s*(?:Original|Forwarded) Message\s*[-]{3,}\n/i,
  // Outlook-style From/Sent/To header block
  /\nFrom:\s*.{1,200}\n(?:Sent|Date):\s*.{1,200}\nTo:\s*.{1,200}\n/,
];

/**
 * Split a plaintext email body from its quoted chain.
 *
 * Returns `{ body, quote }` where `body` is the new-message text and `quote`
 * is the collapsed chain (or `null` if no quote was detected).
 */
export function splitPlaintextQuote(text: string): QuoteSplit {
  if (!text) return { body: text, quote: null };

  // Normalise CRLF → LF and bare CR → LF so patterns work regardless of
  // email line-ending style (JMAP spec §4.1.4 requires CRLF in bodyValues)
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (const pattern of PLAINTEXT_QUOTE_STARTERS) {
    const match = normalized.match(pattern);
    if (match && match.index !== undefined && match.index > 0) {
      const body = normalized.slice(0, match.index).trimEnd();
      const quote = normalized.slice(match.index).trimStart();
      if (body.length > 0 && quote.length > 0) {
        return { body, quote };
      }
    }
  }

  return { body: normalized, quote: null };
}

/**
 * Strip quoted reply blocks from an HTML email string.
 *
 * Detects Gmail (`class="gmail_quote"`), Apple Mail, and standard
 * `<blockquote type="cite">` patterns and removes them from the DOM.
 *
 * Falls back gracefully when `DOMParser` is unavailable (SSR): returns the
 * original HTML but still sets `hasQuote` so the caller can offer a reveal
 * button without breaking the initial render.
 */
export function splitHtmlQuote(html: string): {
  html: string;
  hasQuote: boolean;
} {
  // Quick heuristic to avoid a full parse when there is nothing to strip
  const hasGmailQuote = /class="[^"]*gmail_quote[^"]*"/i.test(html);
  const hasGmailExtra = /class="[^"]*gmail_extra[^"]*"/i.test(html);
  const hasBlockquoteCite = /blockquote[^>]+type="cite"/i.test(html);
  const hasAppleMail = /class="[^"]*apple_content_edited[^"]*"/i.test(html);

  if (!hasGmailQuote && !hasGmailExtra && !hasBlockquoteCite && !hasAppleMail) {
    return { html, hasQuote: false };
  }

  if (typeof DOMParser === "undefined") {
    return { html, hasQuote: true };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      `<!DOCTYPE html><html><body>${html}</body></html>`,
      "text/html",
    );

    const QUOTE_SELECTORS = [
      ".gmail_quote",
      ".gmail_extra",
      'blockquote[type="cite"]',
      ".apple_content_edited",
    ];

    let hasQuote = false;
    for (const sel of QUOTE_SELECTORS) {
      doc.querySelectorAll(sel).forEach((el) => {
        el.remove();
        hasQuote = true;
      });
    }

    const stripped = doc.body.innerHTML;
    // If stripping leaves an empty body, return the original unstripped HTML
    if (
      hasQuote &&
      stripped.replace(/<[^>]+>/g, "").trim().length === 0
    ) {
      return { html, hasQuote: false };
    }

    return { html: stripped, hasQuote };
  } catch {
    return { html, hasQuote: true };
  }
}
