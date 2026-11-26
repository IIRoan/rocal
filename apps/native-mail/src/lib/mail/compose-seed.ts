import {
  buildEmbeddedSignatureHtml,
  buildNewComposeHtml,
  composeTextToHtml,
  getErrorMessage,
  hasComposeFormatting,
  htmlToPlainText,
  insertPlainTextSignature,
  placeComposeQuote,
  plainTextToComposeHtml,
  resolveMessageReplyRecipients,
  type ComposeTextFields,
  type QuotedDateOptions,
  type SignatureSource,
} from "@workspace/calendar-core";
import type { ComposeRequest } from "./compose-request";
import type { PendingComposeAttachment } from "./compose-attachments";
import type { ComposeFields } from "./compose-form";
import {
  buildForwardBody,
  buildForwardHtml,
  buildReplyBody,
  buildReplyHtml,
  formatAddressList,
  prefixSubject,
} from "./compose-quote";
import { decryptMailMessage, decryptPgpMimeMessage } from "./mail-crypto";
import { formatReplyAllRecipientFields } from "./mail-helpers";
import type { MailRuntime } from "./mail-runtime";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  resolveInlinePgpArmoredCiphertext,
} from "./message-security";
import type { JmapEmailMessage, JmapIdentity } from "./types";
import { getMailDraftSizeError, limitMailQuoteContent } from "@workspace/calendar-core/mail-mime-limits";
import { MAIL_DRAFT_TEXT_LIMITS } from "@workspace/calendar-core/mail-mime-parser";

const EMPTY_FIELDS: ComposeTextFields = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
};

export type ComposeSeedPlan =
  | { kind: "fields"; fields: ComposeFields; draftId?: string; restoredAttachments?: PendingComposeAttachment[] }
  | { kind: "decrypt-draft"; draftId: string }
  | { kind: "decrypt-source"; draftId?: undefined };

export interface ComposeSeedInput {
  params: ComposeRequest;
  sourceMessage: JmapEmailMessage | null;
  settingsLoaded: boolean;
  replySignaturePosition: string;
  signatureOptions: { separator: boolean };
  /** The sender's default signature, written into a new message, reply or forward as ordinary text. */
  signature: SignatureSource | null;
  identities: JmapIdentity[];
  /** The sender for reply recipients: the auto-selected reply identity's address, else the account's. */
  fromEmail: string | null;
  dateOptions: QuotedDateOptions;
  runtime: MailRuntime | undefined;
  /** The decrypted source body, once an encrypted message has been opened for a reply or forward. */
  sourcePlaintext?: string;
  /** Plain-text compose seeds text and no HTML; otherwise the body is the rich editor's HTML. */
  plainTextMode: boolean;
}

function richFields(fields: ComposeTextFields, htmlBody: string): ComposeFields {
  return { ...fields, body: htmlToPlainText(htmlBody), htmlBody };
}

/** A draft's HTML, or its text as paragraphs; drafts from older native builds kept formatting as markdown-lite text. */
export function draftHtml(bodies: { text?: string | null; html?: string | null }): string {
  if (bodies.html?.trim()) return bodies.html;
  const text = bodies.text ?? "";
  return hasComposeFormatting(text) ? composeTextToHtml(text) : plainTextToComposeHtml(text);
}

function draftFields(
  headers: ComposeTextFields,
  bodies: { text?: string | null; html?: string | null },
  plainTextMode: boolean,
): ComposeFields {
  if (plainTextMode) {
    return { ...headers, body: bodies.text ?? htmlToPlainText(bodies.html ?? ""), htmlBody: "" };
  }
  return richFields(headers, draftHtml(bodies));
}

function newMessageFields(params: ComposeRequest): ComposeTextFields {
  if (params.mailto) {
    const { to, cc, bcc, subject, body } = params.mailto;
    return { to: to.join(", "), cc: cc.join(", "), bcc: bcc.join(", "), subject, body };
  }
  if (!params.to) return EMPTY_FIELDS;
  const name = params.toName?.trim();
  return {
    ...EMPTY_FIELDS,
    to:
      name && name.toLowerCase() !== params.to.toLowerCase()
        ? `${name} <${params.to}>`
        : params.to,
  };
}

function draftHeaders(message: JmapEmailMessage): ComposeTextFields {
  return {
    to: formatAddressList(message.to),
    cc: formatAddressList(message.cc),
    bcc: formatAddressList(message.bcc),
    subject: message.subject ?? "",
    body: "",
  };
}

/** What the compose drawer opens with, or null while the mailbox, source message or settings are still loading. */
export function planComposeSeed({
  params,
  sourceMessage,
  settingsLoaded,
  replySignaturePosition,
  signatureOptions,
  signature,
  identities,
  fromEmail,
  dateOptions,
  runtime,
  sourcePlaintext,
  plainTextMode,
}: ComposeSeedInput): ComposeSeedPlan | null {
  if (params.restore) {
    return {
      kind: "fields",
      fields: params.restore.fields,
      draftId: params.restore.draftId,
      restoredAttachments: params.restore.attachments,
    };
  }
  const aboveQuote = replySignaturePosition === "above_quote";
  const withSignature = (body: string, quoted: boolean) =>
    insertPlainTextSignature(body, signature, {
      ...signatureOptions,
      aboveQuote: quoted && aboveQuote,
    });
  const signatureBlock = buildEmbeddedSignatureHtml(signature, signatureOptions);
  const quoteFields = (fields: ComposeTextFields, quote: () => string, plainBody: () => string): ComposeFields =>
    plainTextMode
      ? { ...fields, body: withSignature(plainBody(), true), htmlBody: "" }
      : richFields(fields, placeComposeQuote(quote(), signatureBlock, aboveQuote));
  if (params.mailto || params.to || !params.mode) {
    // The signature depends on the sender, so a new message waits for the mailbox's identities.
    if (!settingsLoaded || !runtime) return null;
    const fields = newMessageFields(params);
    if (plainTextMode) {
      return { kind: "fields", fields: { ...fields, body: withSignature(fields.body, false), htmlBody: "" } };
    }
    return { kind: "fields", fields: richFields(fields, buildNewComposeHtml(signatureBlock, plainTextToComposeHtml(fields.body))) };
  }
  if (!sourceMessage || !settingsLoaded) return null;

  // Quoting must use the decrypted text; the raw body of an encrypted message is PGP armor.
  if (
    (params.mode === "reply" || params.mode === "reply-all" || params.mode === "forward") &&
    sourcePlaintext === undefined &&
    isEncrypted(sourceMessage)
  ) {
    return runtime ? { kind: "decrypt-source" } : null;
  }

  switch (params.mode) {
    case "reply":
      return {
        kind: "fields",
        fields: quoteFields(
          {
            ...EMPTY_FIELDS,
            to: resolveMessageReplyRecipients(sourceMessage, {
              mode: "reply",
              fromEmail,
              identities,
            }).to.join(", "),
            subject: prefixSubject(sourceMessage.subject, "Re:"),
          },
          () => buildReplyHtml(sourceMessage, dateOptions, sourcePlaintext),
          () => buildReplyBody(sourceMessage, dateOptions, sourcePlaintext),
        ),
      };
    case "reply-all": {
      const recipients = formatReplyAllRecipientFields(sourceMessage, {
        fromEmail,
        identities,
      });
      return {
        kind: "fields",
        fields: quoteFields(
          {
            ...EMPTY_FIELDS,
            to: recipients.to,
            cc: recipients.cc,
            subject: prefixSubject(sourceMessage.subject, "Re:"),
          },
          () => buildReplyHtml(sourceMessage, dateOptions, sourcePlaintext),
          () => buildReplyBody(sourceMessage, dateOptions, sourcePlaintext),
        ),
      };
    }
    case "forward":
      return {
        kind: "fields",
        fields: quoteFields(
          { ...EMPTY_FIELDS, subject: prefixSubject(sourceMessage.subject, "Fwd:") },
          () => buildForwardHtml(sourceMessage, dateOptions, sourcePlaintext),
          () => buildForwardBody(sourceMessage, dateOptions, sourcePlaintext),
        ),
      };
    case "draft": {
      if (isEncrypted(sourceMessage)) {
        return runtime ? { kind: "decrypt-draft", draftId: sourceMessage.id } : null;
      }
      if (getMailDraftSizeError(extractMessageBodies(sourceMessage))) return null;
      return {
        kind: "fields",
        draftId: sourceMessage.id,
        fields: draftFields(draftHeaders(sourceMessage), extractMessageBodies(sourceMessage), plainTextMode),
      };
    }
  }
}

function isEncrypted(message: JmapEmailMessage): boolean {
  const encryption = classifyMessageEncryption(message);
  return encryption === "inline_pgp" || encryption === "pgp_mime";
}

async function decryptMessageContent(
  runtime: MailRuntime,
  message: JmapEmailMessage,
  forDraft: boolean,
): Promise<{ text: string; html?: string | null; truncated?: boolean }> {
  const limits = forDraft ? MAIL_DRAFT_TEXT_LIMITS : undefined;
  const decrypted =
    classifyMessageEncryption(message) === "inline_pgp"
      ? await decryptMailMessage(
          runtime,
          message.id,
          await resolveInlinePgpArmoredCiphertext({
            message,
            fetchBlob: (blobId) =>
              runtime.client.getBlobAsText(runtime.session, blobId),
          }),
          undefined,
          limits,
        )
      : await decryptPgpMimeMessage(runtime, message.id, message.bodyStructure, undefined, limits);
  if (forDraft && decrypted.rawMimeFallback) {
    throw new Error("This draft could not be opened safely here. Edit it on the web. The saved draft has not been changed.");
  }
  return { text: decrypted.plaintext, html: decrypted.html, truncated: decrypted.truncated };
}

/** The plaintext of an inline PGP or PGP/MIME message, bounded for quoting. */
export async function decryptMessagePlaintext(
  runtime: MailRuntime,
  message: JmapEmailMessage,
): Promise<string> {
  const content = await decryptMessageContent(runtime, message, false);
  return limitMailQuoteContent({ text: content.text, truncated: content.truncated }).text ?? "";
}

/** A failed draft read returns headers for the error state; the editor closes before seeding or autosaving. */
export async function decryptDraftFields(
  runtime: MailRuntime,
  message: JmapEmailMessage,
  plainTextMode = false,
): Promise<{ fields: ComposeFields; error: string | null }> {
  const headers = draftHeaders(message);
  const read = async () => {
    const content = await decryptMessageContent(runtime, message, true);
    const sizeError = getMailDraftSizeError(content);
    if (sizeError) throw new Error(sizeError);
    return draftFields(headers, content, plainTextMode);
  };
  return read().then(
    (fields) => ({ fields, error: null }),
    (err: unknown) => ({
      fields: { ...headers, htmlBody: "" },
      error: getErrorMessage(err, "Could not decrypt this draft."),
    }),
  );
}
