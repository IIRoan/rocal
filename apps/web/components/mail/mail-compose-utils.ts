import {
  buildEmbeddedSignatureHtml,
  buildNewComposeHtml,
  insertPlainTextSignature,
  resolveComposeSignature,
} from "@workspace/calendar-core";
import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
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
  plainTextMode: boolean;
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
    plainTextMode: draft.plainTextMode,
    attachmentCount: draft.attachments.length,
    identityId: draft.identityId,
  };
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

/** A new message opens with an empty writing line above the sender's signature, in the default compose mode. */
export function buildNewComposeBodies(identity: JmapIdentity | null): {
  body: string;
  htmlBody: string;
  plainTextMode: boolean;
} {
  const settings = readMailComposeSettings();
  const signature = resolveComposeSignature(
    settings,
    identity ? [identity] : [],
    identity?.id ?? null,
    "newMessage",
  );
  const separator = settings.signatureSeparatorEnabled;
  if (settings.plainTextMode) {
    return {
      body: insertPlainTextSignature("", signature, { separator, aboveQuote: false }),
      htmlBody: "",
      plainTextMode: true,
    };
  }
  return {
    body: "",
    htmlBody: buildNewComposeHtml(buildEmbeddedSignatureHtml(signature, { separator })),
    plainTextMode: false,
  };
}

export type MailComposeDraftFields = {
  composeTo: string;
  composeCc: string;
  composeBcc: string;
  composeSubject: string;
  composeBody: string;
  composeHtmlBody: string;
  plainTextMode: boolean;
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
    plainTextMode: fields.plainTextMode,
    attachments: fields.composeAttachments,
    replyContext: fields.composeReplyContext,
    identityId,
    draftId,
    composeMode: fields.composeMode,
    signatureChoice: fields.signatureChoice,
  };
}
