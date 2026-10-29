import {
  sealOutgoingMessageBody,
  type MailSealer,
  type OutgoingMessageBody,
  type OutgoingMimeAttachment,
} from "@workspace/calendar-core";
import { getRecipientKey } from "./mail-api";
import {
  encryptForRecipients,
  ensureVaultLoaded,
} from "./mail-crypto";
import type { MailRuntime } from "./mail-runtime";

/** Seals mail with the vault unlocked on this device. */
export async function createMailSealer(runtime: MailRuntime): Promise<MailSealer> {
  const { vault } = await ensureVaultLoaded(runtime);
  return {
    selfPublicKeyArmored: vault.publicKeyArmored,
    encrypt: encryptForRecipients,
    upload: async (armoredMessage) => {
      const { blobId, size } = await runtime.client.uploadBlob(
        runtime.session,
        new TextEncoder().encode(armoredMessage),
        "text/plain",
      );
      return { blobId, size };
    },
  };
}

export async function resolveOutgoingMessageBody(input: {
  runtime: MailRuntime;
  recipients: string[];
  plaintext: string;
  html?: string;
  mimeAttachments?: OutgoingMimeAttachment[];
}): Promise<OutgoingMessageBody> {
  return sealOutgoingMessageBody({
    recipients: input.recipients,
    senderEmail: input.runtime.identities[0]?.email ?? "",
    internalDomain: input.runtime.config.defaultDomain,
    content: {
      text: input.plaintext,
      html: input.html,
      attachments: input.mimeAttachments,
    },
    sealer: await createMailSealer(input.runtime),
    getRecipientPublicKey: async (email) =>
      (await getRecipientKey(email)).publicKeyArmored,
  });
}
