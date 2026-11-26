import {
  insertPlainTextSignature,
  resolveComposeSignature,
  type MailSignatureKind,
  type SignatureSource,
} from "@workspace/calendar-core";
import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
import { buildEmbeddedSignatureHtml } from "@/lib/mail/signature-utils";
import type { QuotedInlineAttachment } from "@/lib/mail/compose-editor-utils";
import { readMailComposeSettings } from "@/lib/mail/compose-settings";
import type { ComposeDraft, ComposeMode, MailReplyContext } from "./mail-compose-types";

export type ComposeSnapshot = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  htmlBody: string;
  attachmentCount: number;
  identityId: string | null;
};

export function addressesToCsv(
  addresses: Array<{ email?: string | null }> | undefined,
): string {
  return (addresses ?? []).flatMap((entry) => {
    const email = entry.email?.trim();
    return email ? [email] : [];
  }).join(", ");
}

export function buildComposeSnapshot(draft: ComposeDraft): ComposeSnapshot {
  return {
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    body: draft.body,
    htmlBody: draft.htmlBody,
    attachmentCount: draft.attachments.length,
    identityId: draft.identityId,
  };
}

/** The signature a seeded compose starts with, from the sealed defaults or the identity's own. */
export function resolveSeedSignature(
  identities: JmapIdentity[],
  identityId: string | null,
  kind: MailSignatureKind,
): SignatureSource | null {
  return resolveComposeSignature(readMailComposeSettings(), identities, identityId, kind);
}

export function mapQuotedAttachments(
  message: JmapEmailMessage,
): QuotedInlineAttachment[] {
  return (message.attachments ?? []).map((attachment) => ({
    blobId: attachment.blobId,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    disposition: attachment.disposition,
    cid: attachment.cid,
  }));
}

/** A new message opens with an empty writing line above the sender's signature. */
export function buildNewComposeBodies(identity: JmapIdentity | null): {
  body: string;
  htmlBody: string;
} {
  const settings = readMailComposeSettings();
  const signature = resolveSeedSignature(
    identity ? [identity] : [],
    identity?.id ?? null,
    "newMessage",
  );
  const separator = settings.signatureSeparatorEnabled;
  if (settings.plainTextMode) {
    return {
      body: insertPlainTextSignature("", signature, { separator, aboveQuote: false }),
      htmlBody: "",
    };
  }
  const embedded = buildEmbeddedSignatureHtml(signature, { separator });
  return { body: "", htmlBody: embedded ? `<p></p>${embedded}` : "" };
}

export type MailComposeDraftFields = {
  composeTo: string;
  composeCc: string;
  composeBcc: string;
  composeSubject: string;
  composeBody: string;
  composeHtmlBody: string;
  composeAttachments: File[];
  composeMode: ComposeMode;
  quotedAttachments: QuotedInlineAttachment[];
  signatureChoice?: string | null;
  composeReplyContext: MailReplyContext | null;
};

export function toComposeDraft(
  fields: MailComposeDraftFields,
  identityId: string | null,
  draftId: string | null,
): ComposeDraft {
  return {
    to: fields.composeTo,
    cc: fields.composeCc,
    bcc: fields.composeBcc,
    subject: fields.composeSubject,
    body: fields.composeBody,
    htmlBody: fields.composeHtmlBody,
    attachments: fields.composeAttachments,
    replyContext: fields.composeReplyContext,
    identityId,
    draftId,
    composeMode: fields.composeMode,
    signatureChoice: fields.signatureChoice,
  };
}
