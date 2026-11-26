import {
  buildEmbeddedSignatureHtml,
  buildForwardQuoteHtml,
  buildReplyContext,
  buildReplyQuoteHtml,
  FORWARDED_MESSAGE_HEADER,
  formatQuotedMailDate,
  formatReplyQuoteHeader,
  insertPlainTextSignature,
  placeComposeQuote,
  plainTextToComposeHtml,
  prepareQuotedComposeHtml,
  resolveMessageReplyFrom,
  resolveMessageReplyRecipients,
  type MailComposeSettings,
  type MailtoDraft,
  type QuotedDateOptions,
  type SignatureSource,
} from "@workspace/calendar-core";
import { limitMailQuoteContent } from "@workspace/calendar-core/mail-mime-limits";
import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
import { extractMessageBodies } from "@/lib/mail/message-security";
import { escapeHtml } from "@/lib/mail/compose-editor-utils";
import { readMailComposeSettings } from "@/lib/mail/compose-settings";
import type { MailComposeState } from "./mail-compose-state";
import {
  addressesToCsv,
  buildNewComposeBodies,
  mapQuotedAttachments,
  resolveSeedSignature,
} from "./mail-compose-utils";

type SeedResult = {
  patch: Partial<MailComposeState>;
  identityId?: string | null;
};

/** A reply or forward opens with an empty writing line, then the signature above or below the quote. */
function signQuote(
  quote: { html: string; plain: string },
  signature: SignatureSource | null,
  settings: MailComposeSettings,
): { html: string; plain: string } {
  const aboveQuote = settings.replySignaturePosition === "above_quote";
  const separator = settings.signatureSeparatorEnabled;
  return {
    html: placeComposeQuote(quote.html, buildEmbeddedSignatureHtml(signature, { separator }), aboveQuote),
    plain: insertPlainTextSignature(quote.plain, signature, { separator, aboveQuote }),
  };
}

function resolveSeedIdentity(
  identities: JmapIdentity[],
  resolvedIdentityId: string | null,
  message: JmapEmailMessage,
): string | null {
  const settings = readMailComposeSettings();
  let identityId = resolvedIdentityId;
  if (settings.autoSelectReplyIdentity) {
    const resolved = resolveMessageReplyFrom(identities, message);
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
  dateOptions: QuotedDateOptions,
  mode: "reply" | "reply-all" = "reply",
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
  const signatureIdentity = resolveSeedSignature(
    identities,
    currentIdentity?.id ?? null,
    "replyForward",
  );
  const currentIdentityEmail = currentIdentity?.email ?? null;
  const replyRecipients = resolveMessageReplyRecipients(message, {
    mode,
    fromEmail: currentIdentityEmail,
    identities,
  });
  const subject = message.subject ?? "";
  const rawBodies = extractMessageBodies(message);
  const { text, html } = limitMailQuoteContent({ text: plaintext ?? rawBodies.text, html: rawBodies.html });
  const body = text ?? "";
  const date = formatQuotedMailDate(message.receivedAt, dateOptions);
  const sender = message.from?.[0]?.email ?? "";
  const from = message.from?.[0];
  const fromLabel = from?.name || from?.email || sender;
  const signed = signQuote(
    {
      html: buildReplyQuoteHtml({ date, sender: fromLabel, quoteHtml: prepareQuotedComposeHtml({ text: body, html }) }),
      plain: `\n\n${formatReplyQuoteHeader(date, fromLabel)}\n${body
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}`,
    },
    signatureIdentity,
    settings,
  );

  return {
    identityId: replyIdentityId,
    patch: {
      composeTo: replyRecipients.to.join(", "),
      composeCc: replyRecipients.cc.join(", "),
      composeBcc: "",
      composeSubject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
      composeBody: signed.plain,
      composeHtmlBody: settings.plainTextMode ? "" : signed.html,
      plainTextMode: settings.plainTextMode,
      composeAttachments: [],
      composeReplyContext: { ...buildReplyContext(message), sourceMessage: message },
      composeMode: "reply",
      quotedAttachments: mapQuotedAttachments(message),
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
  dateOptions: QuotedDateOptions,
): SeedResult {
  const settings = readMailComposeSettings();
  const forwardIdentityId = resolveSeedIdentity(
    identities,
    resolvedIdentityId,
    message,
  );
  const subject = message.subject ?? "";
  const rawBodies = extractMessageBodies(message);
  const { text, html } = limitMailQuoteContent({ text: plaintext ?? rawBodies.text, html: rawBodies.html });
  const body = text ?? "";
  const sender = message.from?.[0]?.email ?? "";
  const currentIdentity =
    identities.find((entry) => entry.id === forwardIdentityId) ??
    identities[0] ??
    null;
  const signatureIdentity = resolveSeedSignature(
    identities,
    currentIdentity?.id ?? null,
    "replyForward",
  );
  const date = formatQuotedMailDate(message.receivedAt, dateOptions);
  const from = message.from?.[0];
  const fromFull =
    from?.name && from.email && from.name !== from.email
      ? `${from.name} <${from.email}>`
      : (from?.email || from?.name || sender);
  const plainForward = `${FORWARDED_MESSAGE_HEADER}\nFrom: ${fromFull}\nDate: ${date}\nSubject: ${subject}\n\n${body}`;
  const signed = signQuote(
    {
      html: buildForwardQuoteHtml({ from: fromFull, date, subject, quoteHtml: prepareQuotedComposeHtml({ text: body, html }) }),
      plain: `\n\n${plainForward}`,
    },
    signatureIdentity,
    settings,
  );

  return {
    identityId: forwardIdentityId,
    patch: {
      composeTo: "",
      composeCc: "",
      composeBcc: "",
      composeSubject: subject.startsWith("Fwd: ") ? subject : `Fwd: ${subject}`,
      composeBody: signed.plain,
      composeHtmlBody: settings.plainTextMode ? "" : signed.html,
      plainTextMode: settings.plainTextMode,
      composeAttachments: [],
      composeReplyContext: null,
      composeMode: "forward",
      quotedAttachments: mapQuotedAttachments(message),
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
      plainTextMode: seeded.plainTextMode,
      composeAttachments: [],
      composeReplyContext: null,
      composeMode: "new",
      quotedAttachments: [],
      draftId: null,
      draftSaveStatus: "idle",
      isComposeOpen: true,
      isFullCompose: false,
    },
  };
}

/** A mailto link opens a new message with its fields, its body above the signature. */
export function buildMailtoSeed(
  draft: MailtoDraft,
  identities: JmapIdentity[],
  resolvedIdentityId: string | null,
): SeedResult {
  const identity =
    identities.find((entry) => entry.id === resolvedIdentityId) ??
    identities[0] ??
    null;
  const seeded = buildNewComposeBodies(identity);
  const { plainTextMode } = seeded;

  return {
    patch: {
      composeTo: draft.to.join(", "),
      composeCc: draft.cc.join(", "),
      composeBcc: draft.bcc.join(", "),
      composeSubject: draft.subject,
      composeBody: plainTextMode ? draft.body + seeded.body : seeded.body,
      composeHtmlBody:
        plainTextMode || !draft.body
          ? seeded.htmlBody
          : `<p>${escapeHtml(draft.body).replace(/\n/g, "<br>")}</p>${seeded.htmlBody}`,
      plainTextMode,
      composeAttachments: [],
      composeReplyContext: null,
      composeMode: "new",
      quotedAttachments: [],
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
      : (html ?? plainTextToComposeHtml(bodyText));
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
      plainTextMode: readMailComposeSettings().plainTextMode,
      composeAttachments: [],
      composeReplyContext: buildReplyContext(message),
      composeMode: "draft",
      quotedAttachments: mapQuotedAttachments(message),
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
      plainTextMode: seeded.plainTextMode,
      isComposeOpen: true,
      isFullCompose: false,
    },
  };
}
