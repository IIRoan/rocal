import { assertMailMimeLimits, fitsMailUtf8ByteLimit, MAX_MAIL_MIME_BYTES } from "./mail-mime-limits";
import {
  getEmailDomain,
  normalizeEmailAddress,
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
} from "./mail-addresses";
import {
  runMailSendAction,
  type JmapPgpMimeCiphertext,
  type ScopedOutgoingJmapMessage,
} from "./mail-jmap-email-set";
import { createMimeBoundary } from "./mail-pgp-mime";
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
  /** A detached signature with the vault key over exactly `data`, and the RFC 3156 micalg of its digest. */
  sign?: (input: { data: string }) => Promise<{ armoredSignature: string; micalg: string }>;
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
  signedMimeMessage?: never;
  sentCopyCiphertext: JmapPgpMimeCiphertext;
};

export type OutgoingMessageBody =
  | PlaintextOutgoingBody
  | (OutgoingBodyBase & {
      kind: "signed";
      encrypted: false;
      pgpMimeMessage?: never;
      signedMimeMessage: string;
      sentCopyCiphertext: JmapPgpMimeCiphertext;
    })
  | (OutgoingBodyBase & {
      kind: "inline";
      encrypted: true;
      pgpMimeMessage?: never;
      signedMimeMessage?: never;
      sentCopyCiphertext: null;
    })
  | (OutgoingBodyBase & {
      kind: "import";
      encrypted: true;
      pgpMimeMessage: string;
      signedMimeMessage?: never;
      sentCopyCiphertext: null;
    });

export const SIGNED_MAIL_KEY_FILENAME = "OpenPGP_public_key.asc";

/** RFC 3156 entity: the body with the sender's public key, then a detached signature over exactly those CRLF bytes. */
export async function signOutgoingMailContent(
  content: OutgoingMailContent,
  sealer: MailSealer,
): Promise<string> {
  if (!sealer.sign) throw new Error("Signing is unavailable on this device.");
  const signedPart = buildOutgoingMimeMessage({
    text: content.text,
    html: content.html,
    base64Text: true,
    attachments: [
      ...(content.attachments ?? []),
      {
        filename: SIGNED_MAIL_KEY_FILENAME,
        contentType: "application/pgp-keys",
        content: new TextEncoder().encode(sealer.selfPublicKeyArmored.trim().replace(/\r?\n/g, "\r\n")),
      },
    ],
  }).replace(/\r?\n/g, "\r\n");
  assertMailMimeLimits(signedPart);
  assertCurrent(sealer.isCurrent);
  const { armoredSignature, micalg } = await sealer.sign({ data: signedPart });
  assertCurrent(sealer.isCurrent);
  if (!/^pgp-sha(?:256|384|512)$/.test(micalg)) throw new Error("Mail signature uses an unsupported digest.");
  const armor = armoredSignature.trim().replace(/\r?\n/g, "\r\n");
  if (!armor.startsWith("-----BEGIN PGP SIGNATURE-----\r\n") || !armor.endsWith("\r\n-----END PGP SIGNATURE-----") || /[^\x09\x0a\x0d\x20-\x7e]/.test(armor))
    throw new Error("Mail signature is not complete armored data.");
  const boundary = createMimeBoundary("solace_signed_");
  return [
    `Content-Type: multipart/signed; micalg=${micalg}; protocol="application/pgp-signature"; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    signedPart,
    `--${boundary}`,
    'Content-Type: application/pgp-signature; name="OpenPGP_signature.asc"',
    "Content-Description: OpenPGP digital signature",
    'Content-Disposition: attachment; filename="OpenPGP_signature.asc"',
    "",
    armor,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

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

export type MailCommand = { to: string; subject: string; body: string };

export type MailCommandSender = Pick<
  ScopedOutgoingJmapMessage,
  "identityId" | "fromEmail" | "fromName" | "draftsMailboxId" | "sentMailboxId"
>;

/** A platform's JMAP client, session and sealer, as a list or alias command needs them. */
export type MailCommandTransport<Session> = {
  client: {
    ensureEncryptOnAppendDisabled: (session: Session) => Promise<void>;
    sendMessage: (session: Session, input: ScopedOutgoingJmapMessage) => Promise<unknown>;
  };
  session: Session;
  accountId: string | null;
  createSealer: () => MailSealer | Promise<MailSealer>;
};

/** Sends a list or alias command as plaintext with a self-sealed Sent copy, from `sender`. */
export async function sendJmapMailCommand<Session>(
  transport: MailCommandTransport<Session>,
  sender: MailCommandSender,
  actionId: string,
  command: MailCommand,
): Promise<void> {
  const { client, session, accountId } = transport;
  if (!accountId) throw new Error("Your mailbox is not connected.");
  await runMailSendAction(accountId, actionId, async (sendScope, isActionCurrent) => {
    await client.ensureEncryptOnAppendDisabled(session);
    const sealer = await transport.createSealer();
    const sentCopyCiphertext = await sealMailForSelf({ text: command.body }, sealer);
    if (!isActionCurrent()) throw new Error("This mail action was closed before sending.");
    await client.sendMessage(session, {
      isCurrent: sealer.isCurrent,
      sendScope,
      draftsMailboxId: sender.draftsMailboxId,
      sentMailboxId: sender.sentMailboxId,
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      to: [command.to],
      subject: command.subject,
      textBody: command.body,
      identityId: sender.identityId,
      sentCopyCiphertext,
    });
  });
}

export async function sealOutgoingMessageBody(input: {
  recipients: string[];
  senderEmail: string;
  internalDomain: string | null | undefined;
  content: OutgoingMailContent;
  /** What the self-sealed Sent copy of mail to outside recipients stores, when it differs from what is submitted. */
  sentCopyContent?: OutgoingMailContent;
  sealer: MailSealer;
  getRecipientPublicKey: (email: string) => Promise<string>;
  /** Sign mail to outside recipients as PGP/MIME; encrypted mail is always signed inside its ciphertext. */
  sign?: boolean;
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
    const signedMimeMessage = input.sign ? await signOutgoingMailContent(content, input.sealer) : null;
    const sentCopyCiphertext = await sealMailForSelf(input.sentCopyContent ?? content, input.sealer);
    assertCurrent(isCurrent);
    if (signedMimeMessage)
      return { ...base, kind: "signed", textBody: "", encrypted: false, signedMimeMessage, sentCopyCiphertext };
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
