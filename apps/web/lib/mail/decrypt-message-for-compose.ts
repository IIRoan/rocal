import { createLogger } from "@workspace/logger";
import type { MailDemoConfig } from "@workspace/calendar-core";
import { mailDemoApiService } from "@/lib/mail/api-service";
import { mailCryptoWorkerClient } from "@/lib/mail/worker-client";
import {
  classifyMessageEncryption,
  extractPgpMimeCiphertextBlobId,
  resolveInlinePgpArmoredCiphertext,
} from "@/lib/mail/message-security";
import { parseDecryptedMailContent } from "@/lib/mail/decrypted-mail-content";
import type { JmapEmailMessage, JmapSession } from "@/lib/mail/types";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";

const log = createLogger("decrypt-message-for-compose");

export type DecryptedComposeContent = {
  text: string | null;
  html: string | null;
};

export async function decryptMessageForCompose(
  input: {
    client: StalwartJmapClient;
    session: JmapSession;
    message: JmapEmailMessage;
    config: MailDemoConfig | null | undefined;
  },
): Promise<DecryptedComposeContent> {
  const encState = classifyMessageEncryption(input.message);
  if (encState !== "inline_pgp" && encState !== "pgp_mime") {
    return { text: null, html: null };
  }

  let armoredMessage: string;
  if (encState === "inline_pgp") {
    armoredMessage = await resolveInlinePgpArmoredCiphertext({
      message: input.message,
      fetchBlob: (blobId) =>
        input.client.getBlobAsText(input.session, blobId),
    });
  } else {
    const blobId = extractPgpMimeCiphertextBlobId(input.message.bodyStructure);
    if (!blobId) {
      throw new Error("Could not locate PGP/MIME ciphertext blob.");
    }
    armoredMessage = await input.client.getBlobAsText(input.session, blobId);
  }

  const senderEmail = input.message.from?.[0]?.email;
  let senderPublicKeyArmored: string | undefined;
  if (
    senderEmail &&
    input.config &&
    senderEmail.endsWith(`@${input.config.defaultDomain}`)
  ) {
    try {
      const senderKey = await mailDemoApiService.getRecipientKey(senderEmail);
      senderPublicKeyArmored = senderKey.publicKeyArmored;
    } catch {
      /* best-effort */
    }
  }

  const decrypted = await mailCryptoWorkerClient.decryptMessage({
    armoredMessage,
    senderPublicKeyArmored,
  });

  try {
    const parsed = await parseDecryptedMailContent(decrypted.plaintext);
    return {
      text: parsed.text ?? decrypted.plaintext,
      html: parsed.html ?? null,
    };
  } catch (parseError) {
    log.warn("Failed to parse decrypted MIME for compose", parseError);
    return {
      text: decrypted.plaintext,
      html: null,
    };
  }
}
