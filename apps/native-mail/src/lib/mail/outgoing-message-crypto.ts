import {
  sealOutgoingMessageBody,
  MAIL_KEY_CONTINUITY_ENABLED,
  type MailSealer,
  type OutgoingMessageBody,
  type OutgoingMimeAttachment,
} from "@workspace/calendar-core";
import { getRecipientKey } from "./mail-api";
import {
  encryptForRecipients,
  ensureVaultLoaded,
  isMailVaultCurrent,
} from "./mail-crypto";
import type { MailRuntime } from "./mail-runtime";

/** Seals mail with the vault unlocked on this device. */
export async function createMailSealer(runtime: MailRuntime): Promise<MailSealer> {
  const context = await ensureVaultLoaded(runtime);
  const assertCurrent = () => {
    if (!isMailVaultCurrent(context)) throw new Error("Mail encryption session changed.");
  };
  assertCurrent();
  const sealer: MailSealer = {
    selfPublicKeyArmored: context.vault.publicKeyArmored,
    isCurrent: () => isMailVaultCurrent(context),
    encrypt: async (input) => {
      assertCurrent();
      const result = await encryptForRecipients(input);
      assertCurrent();
      return result;
    },
    upload: async (armoredMessage) => {
      assertCurrent();
      const { blobId, size } = await runtime.client.uploadBlob(
        runtime.session,
        new TextEncoder().encode(armoredMessage),
        "text/plain",
      );
      assertCurrent();
      return { blobId, size };
    },
  };
  return sealer;
}

export async function resolveOutgoingMessageBody(input: {
  runtime: MailRuntime;
  recipients: string[];
  plaintext: string;
  html?: string;
  mimeAttachments?: OutgoingMimeAttachment[];
}): Promise<OutgoingMessageBody> {
  const sealer = await createMailSealer(input.runtime);
  return sealOutgoingMessageBody({
    recipients: input.recipients,
    senderEmail: input.runtime.identities[0]?.email ?? "",
    internalDomain: input.runtime.config.defaultDomain,
    content: {
      text: input.plaintext,
      html: input.html,
      attachments: input.mimeAttachments,
    },
    sealer,
    getRecipientPublicKey: async (email) => {
      if (!MAIL_KEY_CONTINUITY_ENABLED) return (await getRecipientKey(email)).publicKeyArmored;
      const { resolveTrustedMailRecipient } = await import("./mail-trust");
      return resolveTrustedMailRecipient(input.runtime, email, sealer.isCurrent);
    },
  });
}
