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

const EMPTY_FIELDS: ComposeTextFields = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
};

export type ComposeSeedPlan =
  | { kind: "fields"; fields: ComposeTextFields; draftId?: string }
  | { kind: "decrypt-draft"; draftId: string };

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
          body: withSignature(buildReplyBody(sourceMessage, dateOptions)),
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
          body: withSignature(buildReplyBody(sourceMessage, dateOptions)),
        },
      };
    }
    case "forward":
      return {
        kind: "fields",
        fields: {
          ...EMPTY_FIELDS,
          subject: prefixSubject(sourceMessage.subject, "Fwd:"),
          body: withSignature(buildForwardBody(sourceMessage, dateOptions)),
        },
      };
    case "draft": {
      const encryption = classifyMessageEncryption(sourceMessage);
      if (encryption === "inline_pgp" || encryption === "pgp_mime") {
        return runtime ? { kind: "decrypt-draft", draftId: sourceMessage.id } : null;
      }
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

/** Decrypts a saved encrypted draft for editing; a failure still opens its headers with an empty body. */
export async function decryptDraftFields(
  runtime: MailRuntime,
  message: JmapEmailMessage,
): Promise<{ fields: ComposeTextFields; error: string | null }> {
  const headers = draftHeaders(message);
  try {
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
          )
        : await decryptPgpMimeMessage(runtime, message.id, message.bodyStructure);
    return { fields: { ...headers, body: decrypted.plaintext }, error: null };
  } catch (err) {
    return {
      fields: headers,
      error: getErrorMessage(err, "Could not decrypt this draft."),
    };
  }
}
