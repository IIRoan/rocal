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

/** Platform crypto: the unlocked vault's public key, an OpenPGP encrypt signed with its private key, and a JMAP blob upload. */
export type MailSealer = {
  selfPublicKeyArmored: string;
  encrypt: (input: {
    plaintext: string;
    recipientPublicKeysArmored: string[];
  }) => Promise<{ armoredMessage: string }>;
  upload: (armoredMessage: string) => Promise<JmapPgpMimeCiphertext>;
};

export type OutgoingMessageBody = {
  textBody: string;
  encrypted: boolean;
  pgpMimeCiphertext?: JmapPgpMimeCiphertext;
  sentCopyCiphertext: JmapPgpMimeCiphertext | null;
};

/** Text, HTML and attachments as one MIME body encrypted only to the account's own key, the form drafts and Sent copies are stored in. */
export async function sealMailForSelf(
  content: OutgoingMailContent,
  sealer: MailSealer,
): Promise<JmapPgpMimeCiphertext> {
  const { armoredMessage } = await sealer.encrypt({
    plaintext: buildOutgoingMimeMessage(content),
    recipientPublicKeysArmored: [sealer.selfPublicKeyArmored],
  });
  return sealer.upload(armoredMessage);
}

/** Internal-only mail is encrypted to every recipient and the sender; other mail is submitted in plaintext with a self-encrypted Sent copy. */
export async function sealOutgoingMessageBody(input: {
  recipients: string[];
  senderEmail: string;
  internalDomain: string | null | undefined;
  content: OutgoingMailContent;
  sealer: MailSealer;
  getRecipientPublicKey: (email: string) => Promise<string>;
}): Promise<OutgoingMessageBody> {
  const internalDomain = resolveEncryptionInternalDomain(input.internalDomain);
  if (!shouldEncryptOutgoingMail(input.recipients, internalDomain)) {
    return {
      textBody: input.content.text,
      encrypted: false,
      sentCopyCiphertext: await sealMailForSelf(input.content, input.sealer),
    };
  }

  const senderEmail = normalizeEmailAddress(input.senderEmail);
  const recipientPublicKeysArmored = new Set([input.sealer.selfPublicKeyArmored]);
  for (const recipient of input.recipients) {
    if (getEmailDomain(recipient) !== internalDomain || recipient === senderEmail) {
      continue;
    }
    recipientPublicKeysArmored.add(await input.getRecipientPublicKey(recipient));
  }

  const hasAttachments = (input.content.attachments?.length ?? 0) > 0;
  const { armoredMessage } = await input.sealer.encrypt({
    plaintext:
      hasAttachments || input.content.html?.trim()
        ? buildOutgoingMimeMessage(input.content)
        : input.content.text,
    recipientPublicKeysArmored: [...recipientPublicKeysArmored],
  });

  if (hasAttachments) {
    return {
      textBody: "",
      encrypted: true,
      pgpMimeCiphertext: await input.sealer.upload(armoredMessage),
      sentCopyCiphertext: null,
    };
  }
  return { textBody: armoredMessage, encrypted: true, sentCopyCiphertext: null };
}
