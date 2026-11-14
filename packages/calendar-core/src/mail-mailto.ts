import { isValidEmailAddress, parseRecipientString } from "./mail-addresses";

export type MailtoDraft = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
};

export const MAILTO_MAX_LENGTH = 16_384;
export const MAILTO_MAX_RECIPIENTS = 50;
export const MAILTO_MAX_SUBJECT_LENGTH = 998;
export const MAILTO_MAX_BODY_LENGTH = 10_000;

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Splits on raw commas before decoding, so a `%2C` stays inside its address. */
function addRecipients(target: string[], raw: string): void {
  for (const part of raw.split(",")) {
    if (target.length >= MAILTO_MAX_RECIPIENTS) return;
    const decoded = safeDecode(part);
    if (!decoded || !isValidEmailAddress(decoded)) continue;
    const email = parseRecipientString(decoded).email;
    if (!target.includes(email)) target.push(email);
  }
}

/** RFC 6068 mailto: `+` stays literal, so URLSearchParams (form decoding) is never used. */
export function parseMailtoLink(href: string): MailtoDraft | null {
  const trimmed = href.trim();
  if (trimmed.length > MAILTO_MAX_LENGTH || !/^mailto:/i.test(trimmed)) return null;

  const rest = trimmed.slice("mailto:".length).split("#")[0] ?? "";
  const queryIndex = rest.indexOf("?");
  const draft: MailtoDraft = { to: [], cc: [], bcc: [], subject: "", body: "" };
  addRecipients(draft.to, queryIndex >= 0 ? rest.slice(0, queryIndex) : rest);
  if (queryIndex < 0) return draft;

  let subject: string | null = null;
  let body: string | null = null;
  for (const pair of rest.slice(queryIndex + 1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = safeDecode(pair.slice(0, eq))?.toLowerCase();
    const raw = pair.slice(eq + 1);
    if (key === "to" || key === "cc" || key === "bcc") {
      addRecipients(draft[key], raw);
    } else if (key === "subject" && subject === null) {
      subject = safeDecode(raw);
    } else if (key === "body" && body === null) {
      body = safeDecode(raw);
    }
  }
  draft.subject = (subject ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .trim()
    .slice(0, MAILTO_MAX_SUBJECT_LENGTH);
  draft.body = (body ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .slice(0, MAILTO_MAX_BODY_LENGTH);
  return draft;
}
