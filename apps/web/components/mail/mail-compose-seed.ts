import { resolveReplyRecipients } from "@workspace/calendar-core";
import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
import { extractMessageBodies } from "@/lib/mail/message-security";
import {
  buildEmbeddedSignatureHtml,
  getPlainTextSignature,
  hasEmbeddedSignature,
} from "@/lib/mail/signature-utils";
import { buildQuotedHtmlBlock } from "@/components/mail/quoted-html";
import {
  rewriteCidImagesForEditor,
  sanitizeQuotedEmailHtml,
} from "@/lib/mail/compose-editor-utils";
import { readMailComposeSettings } from "@/lib/mail/compose-settings";
import { resolveReplyFrom } from "@/lib/mail/reply-identity";
import type { MailComposeState } from "./mail-compose-state";
import {
  addressesToCsv,
  buildNewComposeBodies,
  buildReplyContext,
  mapQuotedAttachments,
  resolveSignatureIdentity,
} from "./mail-compose-utils";

type SeedResult = {
  patch: Partial<MailComposeState>;
  identityId?: string | null;
};

function resolveSeedIdentity(
  identities: JmapIdentity[],
  resolvedIdentityId: string | null,
  message: Pick<JmapEmailMessage, "to" | "cc" | "bcc">,
): string | null {
  const settings = readMailComposeSettings();
  let identityId = resolvedIdentityId;
  if (settings.autoSelectReplyIdentity) {
    const resolved = resolveReplyFrom(identities, {
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
    });
    if (resolved) {
      identityId = resolved.identityId;
    }
  }
  return identityId;
}

export function buildReplySeed(
  message: JmapEmailMessage,
  plaintext: string | null,
  identities: JmapIdentity[],
  resolvedIdentityId: string | null,
): SeedResult {
  const settings = readMailComposeSettings();
  const replyIdentityId = resolveSeedIdentity(
    identities,
    resolvedIdentityId,
    message,
  );
  const currentIdentity =
    identities.find((entry) => entry.id === replyIdentityId) ??
    identities[0] ??
    null;
  const signatureIdentity = resolveSignatureIdentity(
    identities,
    currentIdentity?.id ?? null,
  );
  const currentIdentityEmail = currentIdentity?.email ?? null;
  const replyRecipients = resolveReplyRecipients({
    from: message.from,
    to: message.to,
    cc: message.cc,
    currentUserEmail: currentIdentityEmail,
  });
  const subject = message.subject ?? "";
  const { text, html } = extractMessageBodies(message);
  const body = plaintext ?? text ?? "";
  const htmlBody = html ?? `<p>${body.replace(/\n/g, "<br>")}</p>`;
  const date = message.receivedAt
    ? new Date(message.receivedAt).toLocaleString()
    : "";
  const sender = message.from?.[0]?.email ?? "";
  const from = message.from?.[0];
  const fromLabel = from?.name || from?.email || sender;
  const embedAboveQuote =
    settings.signaturePosition === "above_quote" &&
    Boolean(
      signatureIdentity?.htmlSignature?.trim() ||
        signatureIdentity?.textSignature?.trim(),
    );
  const signatureBlock = embedAboveQuote
    ? buildEmbeddedSignatureHtml(signatureIdentity, {
        embed: true,
        separator: settings.signatureSeparatorEnabled,
      })
    : "";
  const quotedPlain = `\n\n---\nOn ${date}, ${sender} wrote:\n${body}`;
  const sanitizedQuote = rewriteCidImagesForEditor(
    sanitizeQuotedEmailHtml(htmlBody),
  );
  const quotedHtml = settings.plainTextMode
    ? ""
    : `<p></p>${signatureBlock}<div><p>On ${date}, ${fromLabel} wrote:</p></div>${buildQuotedHtmlBlock(sanitizedQuote)}`;
  const plainBody = settings.plainTextMode
    ? `${embedAboveQuote ? `${settings.signatureSeparatorEnabled ? "\n\n-- \n" : "\n\n"}${getPlainTextSignature(signatureIdentity)}` : ""}\n\nOn ${date}, ${fromLabel} wrote:\n${body
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}`
    : quotedPlain;

  return {
    identityId: replyIdentityId,
    patch: {
      composeTo: replyRecipients.join(", "),
      composeCc: "",
      composeBcc: "",
      composeSubject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
      composeBody: plainBody,
      composeHtmlBody: quotedHtml,
      composeAttachments: [],
      composeReplyContext: buildReplyContext(message),
      composeMode: "reply",
      quotedAttachments: mapQuotedAttachments(message),
      signatureAlreadyEmbedded: embedAboveQuote,
      draftId: null,
      isComposeOpen: true,
    },
  };
}

export function buildForwardSeed(
  message: JmapEmailMessage,
  plaintext: string | null,
  identities: JmapIdentity[],
  resolvedIdentityId: string | null,
): SeedResult {
  const settings = readMailComposeSettings();
  const forwardIdentityId = resolveSeedIdentity(
    identities,
    resolvedIdentityId,
    message,
  );
  const subject = message.subject ?? "";
  const { text, html } = extractMessageBodies(message);
  const body = plaintext ?? text ?? "";
  const htmlBody = html ?? `<p>${body.replace(/\n/g, "<br>")}</p>`;
  const sender = message.from?.[0]?.email ?? "";
  const currentIdentity =
    identities.find((entry) => entry.id === forwardIdentityId) ??
    identities[0] ??
    null;
  const signatureIdentity = resolveSignatureIdentity(
    identities,
    currentIdentity?.id ?? null,
  );
  const embedAboveQuote =
    settings.signaturePosition === "above_quote" &&
    Boolean(
      signatureIdentity?.htmlSignature?.trim() ||
        signatureIdentity?.textSignature?.trim(),
    );
  const signatureBlock = embedAboveQuote
    ? buildEmbeddedSignatureHtml(signatureIdentity, {
        embed: true,
        separator: settings.signatureSeparatorEnabled,
      })
    : "";
  const date = message.receivedAt
    ? new Date(message.receivedAt).toLocaleString()
    : "";
  const from = message.from?.[0];
  const fromFull =
    from?.name && from.email && from.name !== from.email
      ? `${from.name} <${from.email}>`
      : (from?.email || from?.name || sender);
  const sanitizedQuote = rewriteCidImagesForEditor(
    sanitizeQuotedEmailHtml(htmlBody),
  );
  const forwardHeader = `<div>---------- Forwarded message ----------<br>From: ${fromFull}<br>Date: ${date}<br>Subject: ${subject}<br><br></div>`;
  const plainForward = `---------- Forwarded message ----------\nFrom: ${fromFull}\nDate: ${date}\nSubject: ${subject}\n\n${body}`;
  const plainBody = settings.plainTextMode
    ? `${embedAboveQuote ? `${settings.signatureSeparatorEnabled ? "\n\n-- \n" : "\n\n"}${getPlainTextSignature(signatureIdentity)}` : ""}\n\n${plainForward}`
    : `\n\n---\nForwarded message from ${sender}:\n${body}`;

  return {
    identityId: forwardIdentityId,
    patch: {
      composeTo: "",
      composeCc: "",
      composeBcc: "",
      composeSubject: subject.startsWith("Fwd: ") ? subject : `Fwd: ${subject}`,
      composeBody: plainBody,
      composeHtmlBody: settings.plainTextMode
        ? ""
        : `<p></p>${signatureBlock}${forwardHeader}${buildQuotedHtmlBlock(sanitizedQuote)}`,
      composeAttachments: [],
      composeReplyContext: null,
      composeMode: "forward",
      quotedAttachments: mapQuotedAttachments(message),
      signatureAlreadyEmbedded: embedAboveQuote,
      draftId: null,
      isComposeOpen: true,
    },
  };
}

export function buildNewMessageSeed(
  recipient: { email: string; name?: string | null },
  identities: JmapIdentity[],
  resolvedIdentityId: string | null,
): SeedResult {
  const email = recipient.email.trim();
  const name = recipient.name?.trim();
  const to =
    name && name.toLowerCase() !== email.toLowerCase()
      ? `${name} <${email}>`
      : email;
  const identity =
    identities.find((entry) => entry.id === resolvedIdentityId) ??
    identities[0] ??
    null;
  const seeded = buildNewComposeBodies(identity);

  return {
    patch: {
      composeTo: to,
      composeCc: "",
      composeBcc: "",
      composeSubject: "",
      composeBody: seeded.body,
      composeHtmlBody: seeded.htmlBody,
      composeAttachments: [],
      composeReplyContext: null,
      composeMode: "new",
      quotedAttachments: [],
      signatureAlreadyEmbedded: seeded.signatureAlreadyEmbedded,
      draftId: null,
      draftSaveStatus: "idle",
      isComposeOpen: true,
      isFullCompose: false,
    },
  };
}

export function buildDraftSeed(
  message: JmapEmailMessage,
  identities: JmapIdentity[],
  resolvedIdentityId: string | null,
  overrides?: {
    plaintext?: string | null;
    html?: string | null;
  },
): SeedResult {
  const { text, html } = extractMessageBodies(message);
  const bodyText =
    overrides?.plaintext != null ? overrides.plaintext : (text ?? "");
  const htmlBody =
    overrides?.html != null
      ? overrides.html
      : (html ??
        (bodyText ? `<p>${bodyText.replace(/\n/g, "<br>")}</p>` : ""));
  const draftFromEmail = message.from?.[0]?.email;
  const matchedIdentity = draftFromEmail
    ? identities.find((identity) => identity.email === draftFromEmail)
    : null;
  const draftIdentityId =
    matchedIdentity?.id ?? resolvedIdentityId ?? identities[0]?.id ?? null;

  return {
    identityId: draftIdentityId,
    patch: {
      composeTo: addressesToCsv(message.to),
      composeCc: addressesToCsv(message.cc),
      composeBcc: addressesToCsv(message.bcc),
      composeSubject: message.subject ?? "",
      composeHtmlBody: htmlBody,
      composeBody: bodyText,
      composeAttachments: [],
      composeReplyContext: buildReplyContext(message),
      composeMode: "draft",
      quotedAttachments: mapQuotedAttachments(message),
      signatureAlreadyEmbedded: hasEmbeddedSignature(htmlBody),
      draftId: message.id,
      draftSaveStatus: "idle",
      isComposeOpen: false,
      isFullCompose: true,
    },
  };
}

export function buildOpenNewComposeSeed(
  identities: JmapIdentity[],
  resolvedIdentityId: string | null,
): SeedResult {
  const identity =
    identities.find((entry) => entry.id === resolvedIdentityId) ??
    identities[0] ??
    null;
  const seeded = buildNewComposeBodies(identity);

  return {
    patch: {
      composeTo: "",
      composeCc: "",
      composeBcc: "",
      composeSubject: "",
      composeAttachments: [],
      composeReplyContext: null,
      quotedAttachments: [],
      composeMode: "new",
      draftId: null,
      draftSaveStatus: "idle",
      composeBody: seeded.body,
      composeHtmlBody: seeded.htmlBody,
      signatureAlreadyEmbedded: seeded.signatureAlreadyEmbedded,
      isComposeOpen: true,
      isFullCompose: false,
    },
  };
}
