import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
import {
  appendPlainTextSignature,
  buildEmbeddedSignatureHtml,
  resolveComposeSignatureIdentity,
} from "@/lib/mail/signature-utils";
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

export function buildReplyContext(
  message: Pick<JmapEmailMessage, "threadId" | "messageId" | "references">,
): MailReplyContext {
  const messageIds = (message.messageId ?? []).filter(Boolean);
  const references = Array.from(
    new Set([...(message.references ?? []).filter(Boolean), ...messageIds]),
  );

  return {
    threadId: message.threadId ?? null,
    inReplyTo: messageIds.length > 0 ? messageIds : undefined,
    references: references.length > 0 ? references : undefined,
  };
}

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

export function resolveSignatureIdentity(
  identities: JmapIdentity[],
  identityId: string | null,
): JmapIdentity | null {
  return resolveComposeSignatureIdentity(identities, identityId);
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

export function buildNewComposeBodies(identity: JmapIdentity | null): {
  body: string;
  htmlBody: string;
  signatureAlreadyEmbedded: boolean;
} {
  const settings = readMailComposeSettings();
  const signatureIdentity = resolveSignatureIdentity(
    identity ? [identity] : [],
    identity?.id ?? null,
  );
  const hasSignature = Boolean(
    signatureIdentity?.htmlSignature?.trim() ||
      signatureIdentity?.textSignature?.trim(),
  );

  if (settings.plainTextMode) {
    if (!hasSignature || !signatureIdentity) {
      return { body: "", htmlBody: "", signatureAlreadyEmbedded: false };
    }
    const body = appendPlainTextSignature("", signatureIdentity, {
      separator: settings.signatureSeparatorEnabled,
    });
    return { body, htmlBody: "", signatureAlreadyEmbedded: true };
  }

  const embedded = buildEmbeddedSignatureHtml(signatureIdentity, {
    embed: hasSignature,
    separator: settings.signatureSeparatorEnabled,
  });
  return {
    body: "",
    htmlBody: embedded ? `<p></p>${embedded}` : "",
    signatureAlreadyEmbedded: hasSignature,
  };
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
  signatureAlreadyEmbedded: boolean;
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
    signatureAlreadyEmbedded: fields.signatureAlreadyEmbedded,
  };
}
