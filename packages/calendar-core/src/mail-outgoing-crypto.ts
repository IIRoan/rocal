import { assertMailMimeLimits, fitsMailUtf8ByteLimit, MAX_MAIL_MIME_BYTES } from "./mail-mime-limits";
import {
  getEmailDomain,
  normalizeEmailAddress,
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
} from "./mail-addresses";
import type { JmapPgpMimeCiphertext } from "./mail-jmap-email-set";
import {
  buildOutgoingMimeMessage,
  type OutgoingMimeAttachment,
} from "./outgoing-mime";

export type OutgoingMailContent = {
  text: string;
  html?: string;
  attachments?: OutgoingMimeAttachment[];
};

export type MailSealer = {
  selfPublicKeyArmored: string;
  isCurrent: () => boolean;
  encrypt: (input: {
    plaintext: string;
    recipientPublicKeysArmored: string[];
  }) => Promise<{ armoredMessage: string }>;
  upload: (armoredMessage: string) => Promise<JmapPgpMimeCiphertext>;
};

type OutgoingBodyBase = {
  textBody: string;
  contentFingerprint: string;
  isCurrent: () => boolean;
  pgpMimeCiphertext?: never;
};

export type PlaintextOutgoingBody = OutgoingBodyBase & {
  kind: "plaintext";
  encrypted: false;
  pgpMimeMessage?: never;
  sentCopyCiphertext: JmapPgpMimeCiphertext;
};

export type OutgoingMessageBody =
  | PlaintextOutgoingBody
  | (OutgoingBodyBase & {
      kind: "inline";
      encrypted: true;
      pgpMimeMessage?: never;
      sentCopyCiphertext: null;
    })
  | (OutgoingBodyBase & {
      kind: "import";
      encrypted: true;
      pgpMimeMessage: string;
      sentCopyCiphertext: null;
    });

function assertCurrent(isCurrent: () => boolean): void {
  if (!isCurrent())
    throw new Error(
      "Your unlocked mailbox changed. Open the message again before sending.",
    );
}

export async function uploadPlaintextMailAttachments<T>(
  body: PlaintextOutgoingBody,
  upload: () => Promise<T>,
): Promise<T> {
  if (
    body.kind !== "plaintext" ||
    body.encrypted ||
    body.pgpMimeMessage ||
    body.pgpMimeCiphertext
  ) {
    throw new Error("Encrypted mail cannot upload plaintext attachments.");
  }
  assertCurrent(body.isCurrent);
  const result = await upload();
  assertCurrent(body.isCurrent);
  return result;
}

function copyContent(content: OutgoingMailContent): OutgoingMailContent {
  return {
    text: content.text,
    html: content.html,
    attachments: content.attachments?.map((attachment) => ({
      ...attachment,
      content: Uint8Array.from(attachment.content),
    })),
  };
}

export async function fingerprintMailContent(
  content: OutgoingMailContent,
  isCurrent: () => boolean,
): Promise<string> {
  assertCurrent(isCurrent);
  const hex = (bytes: ArrayBuffer) =>
    Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  const attachments = [];
  for (const attachment of content.attachments ?? []) {
    assertCurrent(isCurrent);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      Uint8Array.from(attachment.content),
    );
    assertCurrent(isCurrent);
    attachments.push({
      filename: attachment.filename,
      contentType: attachment.contentType,
      cid: attachment.cid ?? null,
      disposition: attachment.disposition ?? "attachment",
      digest: hex(digest),
    });
  }
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      text: content.text,
      html: content.html ?? null,
      attachments,
    }),
  );
  assertCurrent(isCurrent);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  assertCurrent(isCurrent);
  return hex(digest);
}

export async function sealMailForSelf(
  content: OutgoingMailContent,
  sealer: MailSealer,
): Promise<JmapPgpMimeCiphertext> {
  assertCurrent(sealer.isCurrent);
  const plaintext = buildOutgoingMimeMessage(copyContent(content));
  assertMailMimeLimits(plaintext);
  const { armoredMessage } = await sealer.encrypt({
    plaintext,
    recipientPublicKeysArmored: [sealer.selfPublicKeyArmored],
  });
  assertCurrent(sealer.isCurrent);
  const uploaded = await sealer.upload(armoredMessage);
  assertCurrent(sealer.isCurrent);
  return uploaded;
}

export async function sealOutgoingMessageBody(input: {
  recipients: string[];
  senderEmail: string;
  internalDomain: string | null | undefined;
  content: OutgoingMailContent;
  sealer: MailSealer;
  getRecipientPublicKey: (email: string) => Promise<string>;
}): Promise<OutgoingMessageBody> {
  const isCurrent = input.sealer.isCurrent;
  assertCurrent(isCurrent);
  const content = copyContent(input.content);
  const recipients = [...input.recipients];
  const contentFingerprint = await fingerprintMailContent(content, isCurrent);
  assertCurrent(isCurrent);
  const base = { contentFingerprint, isCurrent };
  const internalDomain = resolveEncryptionInternalDomain(input.internalDomain);
  if (!shouldEncryptOutgoingMail(recipients, internalDomain)) {
    const sentCopyCiphertext = await sealMailForSelf(content, input.sealer);
    assertCurrent(isCurrent);
    return {
      ...base,
      kind: "plaintext",
      textBody: content.text,
      encrypted: false,
      sentCopyCiphertext,
    };
  }
  const senderEmail = normalizeEmailAddress(input.senderEmail);
  const recipientPublicKeysArmored = new Set([
    input.sealer.selfPublicKeyArmored,
  ]);
  for (const recipient of recipients) {
    const normalized = normalizeEmailAddress(recipient);
    if (
      getEmailDomain(normalized) !== internalDomain ||
      normalized === senderEmail
    )
      continue;
    assertCurrent(isCurrent);
    const key = await input.getRecipientPublicKey(recipient);
    assertCurrent(isCurrent);
    recipientPublicKeysArmored.add(key);
  }
  const hasAttachments = (content.attachments?.length ?? 0) > 0;
  assertCurrent(isCurrent);
  const plaintext = hasAttachments || content.html?.trim() ? buildOutgoingMimeMessage(content) : content.text;
  if (hasAttachments || content.html?.trim()) assertMailMimeLimits(plaintext);
  else if (!fitsMailUtf8ByteLimit(plaintext, MAX_MAIL_MIME_BYTES)) throw new Error("Mail content exceeds the size limit.");
  const { armoredMessage } = await input.sealer.encrypt({
    plaintext,
    recipientPublicKeysArmored: [...recipientPublicKeysArmored],
  });
  assertCurrent(isCurrent);
  if (hasAttachments) {
    return {
      ...base,
      kind: "import",
      textBody: "",
      encrypted: true,
      pgpMimeMessage: armoredMessage,
      sentCopyCiphertext: null,
    };
  }
  return {
    ...base,
    kind: "inline",
    textBody: armoredMessage,
    encrypted: true,
    sentCopyCiphertext: null,
  };
}
