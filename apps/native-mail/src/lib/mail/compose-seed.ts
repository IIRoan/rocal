import {
  getErrorMessage,
  messageBodiesToComposeText,
  prependPlainTextSignature,
  resolveMessageReplyRecipients,
  type ComposeTextFields,
  type QuotedDateOptions,
} from "@workspace/calendar-core";
import type { ComposeRequest } from "./compose-request";
import {
  buildForwardBody,
  buildReplyBody,
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
  | { kind: "fields"; fields: ComposeTextFields; draftId?: string }
  | { kind: "decrypt-draft"; draftId: string }
  | { kind: "decrypt-source"; draftId?: undefined };

export interface ComposeSeedInput {
  params: ComposeRequest;
  sourceMessage: JmapEmailMessage | null;
  settingsLoaded: boolean;
  signaturePosition: string;
  signatureOptions: { separator?: boolean };
  identity: JmapIdentity | null;
  identities: JmapIdentity[];
  /** The sender for reply recipients: the auto-selected reply identity's address, else the account's. */
  fromEmail: string | null;
  dateOptions: QuotedDateOptions;
  runtime: MailRuntime | undefined;
  /** The decrypted source body, once an encrypted message has been opened for a reply or forward. */
  sourcePlaintext?: string;
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

/** What the compose drawer opens with, or null while the source message or settings are still loading. */
export function planComposeSeed({
  params,
  sourceMessage,
  settingsLoaded,
  signaturePosition,
  signatureOptions,
  identity,
  identities,
  fromEmail,
  dateOptions,
  runtime,
  sourcePlaintext,
}: ComposeSeedInput): ComposeSeedPlan | null {
  if (params.to) {
    const name = params.toName?.trim();
    return {
      kind: "fields",
      fields: {
        ...EMPTY_FIELDS,
        to:
          name && name.toLowerCase() !== params.to.toLowerCase()
            ? `${name} <${params.to}>`
            : params.to,
      },
    };
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

  const withSignature = (quoteBody: string) =>
    signaturePosition === "above_quote"
      ? prependPlainTextSignature(quoteBody, identity, signatureOptions)
      : quoteBody;

  switch (params.mode) {
    case "reply":
      return {
        kind: "fields",
        fields: {
          ...EMPTY_FIELDS,
          to: resolveMessageReplyRecipients(sourceMessage, {
            mode: "reply",
            fromEmail,
            identities,
          }).to.join(", "),
          subject: prefixSubject(sourceMessage.subject, "Re:"),
          body: withSignature(buildReplyBody(sourceMessage, dateOptions, sourcePlaintext)),
        },
      };
    case "reply-all": {
      const recipients = formatReplyAllRecipientFields(sourceMessage, {
        fromEmail,
        identities,
      });
      return {
        kind: "fields",
        fields: {
          ...EMPTY_FIELDS,
          to: recipients.to,
          cc: recipients.cc,
          subject: prefixSubject(sourceMessage.subject, "Re:"),
          body: withSignature(buildReplyBody(sourceMessage, dateOptions, sourcePlaintext)),
        },
      };
    }
    case "forward":
      return {
        kind: "fields",
        fields: {
          ...EMPTY_FIELDS,
          subject: prefixSubject(sourceMessage.subject, "Fwd:"),
          body: withSignature(buildForwardBody(sourceMessage, dateOptions, sourcePlaintext)),
        },
      };
    case "draft": {
      if (isEncrypted(sourceMessage)) {
        return runtime ? { kind: "decrypt-draft", draftId: sourceMessage.id } : null;
      }
      if (getMailDraftSizeError(extractMessageBodies(sourceMessage))) return null;
      return {
        kind: "fields",
        draftId: sourceMessage.id,
        fields: {
          ...draftHeaders(sourceMessage),
          body: messageBodiesToComposeText(extractMessageBodies(sourceMessage)),
        },
      };
    }
    default:
      return { kind: "fields", fields: EMPTY_FIELDS };
  }
}

function isEncrypted(message: JmapEmailMessage): boolean {
  const encryption = classifyMessageEncryption(message);
  return encryption === "inline_pgp" || encryption === "pgp_mime";
}

/** The plaintext of an inline PGP or PGP/MIME message. */
export async function decryptMessagePlaintext(
  runtime: MailRuntime,
  message: JmapEmailMessage,
  forDraft = false,
): Promise<string> {
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
  const content = { text: decrypted.plaintext, html: decrypted.html, truncated: decrypted.truncated };
  if (!forDraft) return limitMailQuoteContent({ text: content.text, truncated: content.truncated }).text ?? "";
  const sizeError = getMailDraftSizeError(content);
  if (sizeError) throw new Error(sizeError);
  return decrypted.plaintext;
}

/** A failed draft read returns headers for the error state; the editor closes before seeding or autosaving. */
export async function decryptDraftFields(
  runtime: MailRuntime,
  message: JmapEmailMessage,
): Promise<{ fields: ComposeTextFields; error: string | null }> {
  const headers = draftHeaders(message);
  try {
    return { fields: { ...headers, body: await decryptMessagePlaintext(runtime, message, true) }, error: null };
  } catch (err) {
    return {
      fields: headers,
      error: getErrorMessage(err, "Could not decrypt this draft."),
    };
  }
}
